import type { NextConfig } from 'next';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isPagesBuild = process.env.DEPLOY_GITHUB_PAGES === 'true';
const basePath = isPagesBuild && repository ? `/${repository}` : '';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
};

export default config;
