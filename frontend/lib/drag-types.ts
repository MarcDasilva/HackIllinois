export const STORAGE_DRAG_TYPE = "application/velum-storage-file";

export type StorageDragPayload = {
  id: string;
  name: string;
  size: number | null;
  mime_type: string | null;
};
