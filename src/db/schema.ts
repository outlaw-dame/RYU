export const collections = {
  instances: {
    schema: {
      title: 'instances',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
        createdAt: { type: 'string' }
      },
      required: ['id', 'url']
    }
  }
};
