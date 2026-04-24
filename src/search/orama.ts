import { create, insertMultiple, search } from '@orama/orama';
import { initializeDatabase } from '@/db/client';

let orama: any;

export async function getOrama() {
  if (orama) return orama;

  orama = await create({
    schema: {
      id: 'string',
      type: 'string',
      title: 'string',
      description: 'string'
    }
  });

  const db = await initializeDatabase();

  const editions = await db.editions.find().exec();

  await insertMultiple(orama, editions.map((d: any) => ({
    id: d.id,
    type: 'edition',
    title: d.title,
    description: d.description || ''
  })));

  return orama;
}

export async function searchOrama(query: string) {
  const db = await getOrama();

  return search(db, {
    term: query,
    limit: 10
  });
}
