export const collections = {
  authors: {
    schema: {
      title: 'authors',
      version: 1,
      type: 'object',
      primaryKey: 'id',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        summary: { type: 'string' },
        url: { type: 'string' }
      },
      required: ['id', 'name']
    }
  },
  works: {
    schema: {
      title: 'works',
      version: 1,
      type: 'object',
      primaryKey: 'id',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        authorIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['id', 'title']
    }
  },
  editions: {
    schema: {
      title: 'editions',
      version: 1,
      type: 'object',
      primaryKey: 'id',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        authorIds: { type: 'array', items: { type: 'string' } },
        workId: { type: 'string' },
        coverUrl: { type: 'string' }
      },
      required: ['id', 'title']
    }
  }
};
