import Constants from 'expo-constants';

/**
 * App version, YYYY.MM.<build>, shown in the profile menu so the crew can report what they are
 * running. Set when the app is built (see app.config.js).
 */
export const APP_VERSION = `${Constants.expoConfig?.version ?? ''}`;
