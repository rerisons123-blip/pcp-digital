/**
 * Fila local de coletas pendentes de envio.
 *
 * Usada só a partir do momento em que o usuário já apertou "Confirmar e salvar" — ou seja,
 * já passou pela conferência/correção. Se não houver internet nesse momento, o registro
 * (dados + imagem em base64) fica guardado aqui e é reenviado assim que a conexão voltar,
 * em vez de o usuário perder o trabalho de digitação.
 */

const DB_NAME = 'pcp-digital-offline';
const STORE = 'pending-orders';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'localId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {object} order - payload pronto para ser enviado ao Supabase quando houver conexão */
export async function enqueue(order) {
  const db = await openDB();
  const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await tx(db, 'readwrite', (store) => store.put({ ...order, localId, queuedAt: Date.now() }));
  return localId;
}

export async function listPending() {
  const db = await openDB();
  return await tx(db, 'readonly', (store) => store.getAll());
}

export async function remove(localId) {
  const db = await openDB();
  await tx(db, 'readwrite', (store) => store.delete(localId));
}

export async function pendingCount() {
  const items = await listPending();
  return items.length;
}

function tx(db, mode, action) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const request = action(store);
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }
  });
}
