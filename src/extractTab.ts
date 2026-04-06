import { runPipeline, getIncrementalResults } from './pipelineOrchestrator.js';
import { drawGridOverlay } from './cropper.js';
import type { PipelineProgress } from './pipelineOrchestrator.js';

export function initExtractTab(container: HTMLElement): void {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Extract';
  section.appendChild(heading);

  // File input
  const fileRow = document.createElement('div');
  fileRow.style.display = 'flex';
  fileRow.style.gap = '0.5rem';
  fileRow.style.alignItems = 'center';
  fileRow.style.marginBottom = '1rem';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg';

  const runBtn = document.createElement('button');
  runBtn.className = 'btn';
  runBtn.textContent = 'RUN PIPELINE';
  runBtn.disabled = true;

  fileRow.appendChild(fileInput);
  fileRow.appendChild(runBtn);
  section.appendChild(fileRow);

  // Grid preview (shown when file is selected)
  const previewWrap = document.createElement('div');
  previewWrap.className = 'grid-preview-wrap';
  previewWrap.style.marginBottom = '1rem';
  section.appendChild(previewWrap);

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.style.cssText = 'width:100%;background:#1a1a1a;height:16px;margin-bottom:0.5rem;display:none;';
  const progressBar = document.createElement('div');
  progressBar.style.cssText = 'height:100%;background:#62eeb7;width:0%;transition:width 0.3s;';
  progressWrap.appendChild(progressBar);
  section.appendChild(progressWrap);

  const progressLabel = document.createElement('div');
  progressLabel.className = 'status-msg';
  section.appendChild(progressLabel);

  const errorEl = document.createElement('div');
  section.appendChild(errorEl);

  // Crash-recovery notice
  const partial = getIncrementalResults();
  if (partial && partial.length > 0) {
    const notice = document.createElement('p');
    notice.className = 'status-msg';
    notice.textContent = `Partial run found: ${partial.length} crops recovered. Upload the same screenshot and run again, or import the partial data in the Review tab.`;
    section.appendChild(notice);
  }

  fileInput.addEventListener('change', () => {
    runBtn.disabled = !fileInput.files?.length;

    // Show grid overlay preview
    while (previewWrap.firstChild) previewWrap.removeChild(previewWrap.firstChild);
    const file = fileInput.files?.[0];
    if (!file) return;
    drawGridOverlay(
      file,
      (canvas) => { previewWrap.appendChild(canvas); },
      (err) => {
        errorEl.className = 'import-error';
        errorEl.textContent = `Grid preview failed: ${(err as Error).message}`;
      },
    );
  });

  runBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    runBtn.disabled = true;
    errorEl.textContent = '';
    errorEl.className = '';
    progressWrap.style.display = 'block';

    const onProgress = (p: PipelineProgress) => {
      const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
      progressBar.style.width = `${pct}%`;
      progressLabel.textContent = p.currentLabel;
    };

    try {
      await runPipeline(file, onProgress);
      progressLabel.textContent = 'Done! Go to the Review tab to inspect results.';
      progressBar.style.width = '100%';
    } catch (err) {
      errorEl.className = 'import-error';
      errorEl.textContent = `ERROR: ${(err as Error).message}`;
    } finally {
      runBtn.disabled = false;
    }
  });

  container.appendChild(section);
}
