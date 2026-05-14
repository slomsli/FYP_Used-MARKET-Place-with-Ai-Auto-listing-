import { Request, Response, NextFunction } from 'express';
import { getAllSettings, upsertSetting } from '../services/settingsService';

export const getPlatformSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settings = await getAllSettings();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);

    res.json({ success: true, data: settingsMap });
  } catch (error) {
    next(error);
  }
};

export const updatePlatformSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settingsToUpdate = req.body;
    const adminId = (req as any).user?.id;

    if (!settingsToUpdate || typeof settingsToUpdate !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid settings payload' });
    }

    const updatedSettings = [];
    
    // Process each setting update
    for (const [key, value] of Object.entries(settingsToUpdate)) {
      if (value !== undefined) {
        const updated = await upsertSetting(key, value, undefined, adminId);
        updatedSettings.push(updated);
      }
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
};
