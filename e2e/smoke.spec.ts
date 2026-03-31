import { expect, test } from '@playwright/test';

test('sample clip tracking gets past worker bootstrap under the configured base path', async ({ page }) => {
  const runtimeErrors: string[] = [];

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto('/stick-to-gif/');

  await expect(page.getByRole('button', { name: 'Try The Sample Clip' })).toBeVisible();
  await page.getByRole('button', { name: 'Try The Sample Clip' }).click();

  await expect(page.getByText('Tap the thing you want to track')).toBeVisible({ timeout: 15000 });

  const editorCanvas = page.getByTestId('editor-canvas');
  await expect(editorCanvas).toBeVisible();
  await editorCanvas.click({ position: { x: 100, y: 75 } });

  await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();

  const opencvResponse = page.waitForResponse(
    (response) => response.url().includes('/stick-to-gif/opencv.js') && response.status() === 200,
    { timeout: 15000 },
  );

  await page.getByRole('button', { name: 'Track' }).click();

  await opencvResponse;
  await expect(page.getByText('Loading OpenCV runtime in worker')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Loading OpenCV runtime in worker')).toBeHidden({ timeout: 30000 });
  await expect(page.getByText('Step 3 of 4')).toBeVisible({ timeout: 15000 });

  expect(runtimeErrors).toEqual([]);
});
