/** Grabs a poster frame from a video file so the gallery can show a thumbnail. */
export function videoPoster(file: File): Promise<{ blob: Blob | null; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (blob: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ blob, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    };
    const timer = setTimeout(() => finish(null), 6000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.8);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
  });
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined) {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The audio format this browser's recorder can actually produce. */
export function recorderMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
