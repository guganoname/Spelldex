/** Worker: runs Florence-2 with transformers.js (WebGPU when available, else WASM). */
import * as Comlink from 'comlink';
import { AutoProcessor, Florence2ForConditionalGeneration, RawImage, env } from '@huggingface/transformers';
import { ART_MODEL_DTYPE, ART_MODEL_ID, ART_TASK, type CaptionWorkerApi } from './model.ts';

env.allowLocalModels = false;

type Model = Awaited<ReturnType<typeof Florence2ForConditionalGeneration.from_pretrained>>;
type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

let loading: Promise<{ model: Model; processor: Processor; device: 'webgpu' | 'wasm' }> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter && adapter.features.has('shader-f16');
  } catch {
    return false;
  }
}

function load(onProgress?: (p: number) => void) {
  loading ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== 'progress' || !e.file || !e.total) return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      onProgress?.(total ? loaded / total : 0);
    };
    const processor = await AutoProcessor.from_pretrained(ART_MODEL_ID, { progress_callback });
    const opts = { dtype: ART_MODEL_DTYPE, progress_callback };
    if (await hasWebGpu()) {
      try {
        const model = await Florence2ForConditionalGeneration.from_pretrained(ART_MODEL_ID, { ...opts, device: 'webgpu' });
        return { model, processor, device: 'webgpu' as const };
      } catch (e) {
        console.warn('[art-ai] WebGPU failed, falling back to WASM', e);
      }
    }
    const model = await Florence2ForConditionalGeneration.from_pretrained(ART_MODEL_ID, { ...opts, device: 'wasm' });
    return { model, processor, device: 'wasm' as const };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

const api: CaptionWorkerApi = {
  async load(onProgress) {
    return (await load(onProgress)).device;
  },
  caption(url) {
    // One image at a time: the model is not re-entrant and phones have little memory.
    const run = queue.then(async () => {
      const { model, processor } = await load();
      const image = await RawImage.fromURL(url);
      const p = processor as unknown as {
        construct_prompts(t: string): string[];
        (image: RawImage, prompts: string[]): Promise<Record<string, unknown>>;
        batch_decode(ids: unknown, o: { skip_special_tokens: boolean }): string[];
        post_process_generation(text: string, task: string, size: [number, number]): Record<string, string>;
      };
      const inputs = await p(image, p.construct_prompts(ART_TASK));
      const ids = await (model as unknown as { generate(o: Record<string, unknown>): Promise<unknown> }).generate({ ...inputs, max_new_tokens: 120 });
      const text = p.batch_decode(ids, { skip_special_tokens: false })[0] ?? '';
      return p.post_process_generation(text, ART_TASK, image.size as [number, number])[ART_TASK]?.trim() ?? '';
    });
    queue = run.catch(() => undefined);
    return run;
  },
};

Comlink.expose(api);
