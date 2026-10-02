import type { ConfigContext } from 'expo/config';
import appConfig from '../app.config';

const original = process.env.APP_ENV;
const context: ConfigContext = {
  projectRoot: '/fixture',
  staticConfigPath: '/fixture/app.json',
  packageJsonPath: '/fixture/package.json',
  config: { name: 'CrewTally', slug: 'crewtally-mobile', extra: { retainedSetting: 'fixture' } },
};
afterEach(() => {
  if (original === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = original;
});

it.each(['development', 'production'])('sets appEnv from APP_ENV=%s without dropping config', env => {
  process.env.APP_ENV = env;
  const result = appConfig(context);
  expect(result.extra).toEqual({ retainedSetting: 'fixture', appEnv: env });
  expect(result.name).toBe('CrewTally');
  expect(result.slug).toBe('crewtally-mobile');
});

it('uses unknown when APP_ENV is absent', () => {
  delete process.env.APP_ENV;
  expect(appConfig(context).extra?.appEnv).toBe('unknown');
});