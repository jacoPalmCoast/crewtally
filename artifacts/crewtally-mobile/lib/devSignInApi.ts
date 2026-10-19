import type { signInDev as generatedDevSignIn } from '@workspace/api-client-react';
import type { DeveloperSignInLabel } from '@/contexts/AuthContext';
import Constants from 'expo-constants';

export const requestDevSignIn = __DEV__
  && Constants.expoConfig?.extra?.appEnv === 'development'
  ? function requestDevSignIn(code: string, label: DeveloperSignInLabel) {
    const { signInDev } = require('@workspace/api-client-react') as {
      signInDev: typeof generatedDevSignIn;
    };
    return signInDev({ code, label });
  }
  : null;
