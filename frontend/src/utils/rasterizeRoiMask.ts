

/**
 * Creates a binary PNG mask blob from an ROI shape (rectangle or polygon)
 * aligned to the base image dimensions.
 *
 * @param roiMode 'rect' or 'poly'
 * @param roiBox [x1, y1, x2, y2] (for rect mode)
 * @param roiPoints Array of {x, y} points (for poly mode)
 * @param imageWidth Base image width
 * @param imageHeight Base image height
 * @returns Promise<Blob> PNG blob of the mask
 */
export async function rasterizeRoiMask(
  roiMode: 'rect' | 'poly',
  roiBox: [number, number, number, number] | null,
  roiPoints: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get 2d context for mask rasterization');
  }

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  ctx.fillStyle = 'white';
  
  if (roiMode === 'rect' && roiBox) {
    const [x1, y1, x2, y2] = roiBox;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    ctx.fillRect(x, y, w, h);
  } else if (roiMode === 'poly' && roiPoints && roiPoints.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(roiPoints[0].x, roiPoints[0].y);
    for (let i = 1; i < roiPoints.length; i++) {
      ctx.lineTo(roiPoints[i].x, roiPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create mask blob'));
      }
    }, 'image/png');
  });
}
