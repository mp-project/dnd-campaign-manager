import type { InjectOptions, Response as InjectResponse } from "light-my-request";

const PART_SIZE_BYTES = 8 * 1024 * 1024;

export type MediaUploadFile = {
  originalName: string;
  mimeType: string;
  content: Buffer;
  title?: string;
  altText?: string;
};

/**
 * Runs through all steps of an upload like a client: announce, send the parts, complete.
 *
 * @returns The response of the last step reached, so also of the one that failed.
 */
export async function sendMediaUpload(
  inject: (request: InjectOptions) => Promise<InjectResponse>,
  mediaUrl: string,
  file: MediaUploadFile,
): Promise<InjectResponse> {
  const { content, ...fields } = file;
  const created = await inject({
    method: "POST",
    url: `${mediaUrl}/uploads`,
    payload: { ...fields, sizeBytes: content.length },
  });

  if (created.statusCode !== 201) {
    return created;
  }

  const { id } = created.json() as { id: string };
  const partCount = Math.ceil(content.length / PART_SIZE_BYTES);

  for (let index = 0; index < partCount; index += 1) {
    const part = await inject({
      method: "PUT",
      url: `${mediaUrl}/uploads/${id}/parts/${index + 1}`,
      payload: content.subarray(index * PART_SIZE_BYTES, (index + 1) * PART_SIZE_BYTES),
      headers: { "content-type": "application/octet-stream" },
    });

    if (part.statusCode !== 200) {
      return part;
    }
  }

  return inject({ method: "POST", url: `${mediaUrl}/uploads/${id}/complete` });
}
