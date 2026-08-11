import { Router } from 'express';
import { captchaDataUrl, createCaptchaChallenge } from '../captcha.js';

export const captchaRouter = Router();

/** Issue a short-lived alphanumeric CAPTCHA for login. */
captchaRouter.get('/', (_req, res) => {
  try {
    const { captchaId, imageSvg } = createCaptchaChallenge();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      captchaId,
      imageSvg,
      imageDataUrl: captchaDataUrl(imageSvg),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create captcha' });
  }
});
