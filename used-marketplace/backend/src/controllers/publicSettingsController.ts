import { Request, Response, NextFunction } from 'express';
import { getPublicSettings } from '../services/settingsService';

export const getPlatformConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await getPublicSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};
