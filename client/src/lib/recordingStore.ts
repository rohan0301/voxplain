import type { TranscriptionResult } from '../api';

/**
 * On-device recording storage.
 *
 * Voxplain has no accounts, so recordings never leave the browser. IndexedDB
 * rather than localStorage because localStorage only holds strings — audio
 * would need base64 encoding (~33% larger) against a ~5MB cap, which a single
 * short recording would exceed. IndexedDB stores Blobs directly and its quota
 * is a share of free disk.
 *
 * Consequences worth remembering:
 *  - Per browser, per device. No sync. Chrome on a laptop can't see what
 *    Safari on a phone saved.
 *  - "Clear browsing data" deletes everything here, as does closing a private
 *    window. The download button is the only durable copy.
 *  - Safari's storage policy evicts data from sites unvisited for ~7 days.
 *    requestPersistence() below asks for an exemption; Safari often declines.
 */

const DB_NAME = 'voxplain';
const DB_VERSION = 1;
const STORE = 'recordings';

export interface StoredRecording {
    id: string;
    projectId: string | null;
    projectName: string;
    recordedAt: string;
    audioBlob: Blob;
    audioType: string;
    fileName: string;
    report: TranscriptionResult;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('recordedAt', 'recordedAt');
                store.createIndex('projectId', 'projectId');
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(db => new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        transaction.oncomplete = () => db.close();
    }));
}

export async function putRecording(recording: StoredRecording): Promise<void> {
    await tx('readwrite', store => store.put(recording));
}

export async function getAllRecordings(): Promise<StoredRecording[]> {
    const rows = await tx<StoredRecording[]>('readonly', store => store.getAll());
    // Newest first, matching what the server used to return.
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function removeRecording(id: string): Promise<void> {
    await tx('readwrite', store => store.delete(id));
}

/**
 * Ask the browser not to evict this origin's data under storage pressure.
 * Chrome grants it based on engagement heuristics; Safari usually refuses.
 * Best-effort — never throws, and the app works the same either way.
 */
export async function requestPersistence(): Promise<boolean> {
    try {
        if (!navigator.storage?.persist) return false;
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
    } catch {
        return false;
    }
}

/** Bytes used and available, when the browser reports it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
    try {
        if (!navigator.storage?.estimate) return null;
        const { usage, quota } = await navigator.storage.estimate();
        return { usage: usage ?? 0, quota: quota ?? 0 };
    } catch {
        return null;
    }
}
