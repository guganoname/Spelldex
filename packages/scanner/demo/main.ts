/** Manual test page for real phones: camera, outline overlay, hit log. Not part of the app bundle. */
import { startCameraScan, type CameraScan } from '../src/camera.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const status = $<HTMLDivElement>('status');
const overlay = $<HTMLElement>('overlay') as unknown as SVGSVGElement;
const poly = $<HTMLElement>('quad') as unknown as SVGPolygonElement;
let scan: CameraScan | null = null;
let torch = false;
const hits: string[] = [];

$('start').addEventListener('click', async () => {
  status.textContent = 'Lade OpenCV und Index …';
  const indexUrl = new URLSearchParams(location.search).get('index') ?? '/data/scan-index.bin';
  try {
    scan = await startCameraScan({
      video,
      indexUrl,
      onResult: (r) => {
        overlay.setAttribute('viewBox', `0 0 ${video.videoWidth} ${video.videoHeight}`);
        poly.setAttribute('points', 'quad' in r ? r.quad.map((p) => `${p.x},${p.y}`).join(' ') : '');
        if (r.state === 'hit') hits.unshift(`${r.match.set} #${r.match.collectorNumber} (Abstand ${r.match.distance})`);
        status.textContent = `${r.state} · ${r.ms} ms\n${hits.slice(0, 5).join('\n')}`;
      },
    });
    $('torch').hidden = !scan.torchAvailable;
  } catch (e) {
    status.textContent = `Fehler: ${(e as Error).message}`;
  }
});
$('torch').addEventListener('click', () => { torch = !torch; void scan?.setTorch(torch); });
