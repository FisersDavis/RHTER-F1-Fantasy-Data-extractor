export function renderUploadStep(container: HTMLElement, onComplete: () => void): void {
  const p = document.createElement('p');
  p.className = 'text-dim font-mono text-[12px]';
  p.textContent = 'UPLOAD STEP — COMING SOON';
  container.appendChild(p);
}
