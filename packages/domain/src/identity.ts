import metadata from '../../../package.json' with { type: 'json' };

export const PRODUCT = { name: metadata.name, title: 'MOT Lens', version: metadata.version, repository: metadata.repository } as const;
