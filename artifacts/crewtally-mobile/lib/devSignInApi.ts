import type { signInWithApple } from '@workspace/api-client-react';
import type { DeveloperSignInLabel } from '@/contexts/AuthContext';
import Constants from 'expo-constants';

type DevSignInRequest = (body: {
  code: string;
  label: DeveloperSignInLabel;
}) => Promise<Awaited<ReturnType<typeof signInWithApple>>>;

export const requestDevSignIn = __DEV__
  && Constants.expoConfig?.extra?.appEnv === 'development'
  ? function requestDevSignIn(code: string, label: DeveloperSignInLabel) {
    const { signInDev } = require('@workspace/api-client-react') as {
      signInDev: DevSignInRequest;
    };
    return signInDev({ code, label });
  }
  : null;
