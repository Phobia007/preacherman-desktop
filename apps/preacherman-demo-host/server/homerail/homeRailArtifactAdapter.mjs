import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const SAFE_MEDIA_TYPES = new Set([
  "application/gzip",
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "video/mp4",
  "video/webm",
]);

function artifactError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeStatus(value) {
  return value === "uploading" ? "pending" : value;
}

function contentPath(taskId, artifactId) {
  return `/api/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}/content`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cacheKey(taskId, artifactId) {
  return createHash("sha256").update(`${taskId}\0${artifactId}`).digest("hex");
}

function normalizedMediaType(value) {
  return typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value) || value === "." || value === "..") {
    throw artifactError("HOMERAIL_ARTIFACT_METADATA_INVALID", `${label} is invalid.`);
  }
  return value;
}

function assertReadyMetadata(record, maximumBytes) {
  const mediaType = normalizedMediaType(record.media_type);
  if (!SAFE_MEDIA_TYPES.has(mediaType)) {
    throw artifactError("HOMERAIL_ARTIFACT_MEDIA_TYPE_REJECTED", `Artifact media type is not allowed: ${mediaType || "missing"}.`);
  }
  if (!Number.isSafeInteger(record.size_bytes) || record.size_bytes < 0 || record.size_bytes > maximumBytes) {
    throw artifactError("HOMERAIL_ARTIFACT_SIZE_INVALID", `Artifact size must be between 0 and ${maximumBytes} bytes.`);
  }
  if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(record.sha256)) {
    throw artifactError("HOMERAIL_ARTIFACT_HASH_INVALID", "Artifact SHA-256 is missing or invalid.");
  }
  return { mediaType, expectedHash: record.sha256.toLowerCase(), expectedSize: record.size_bytes };
}

function parseRange(value, total) {
  if (!value) return { start: 0, end: Math.max(0, total - 1), partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || total === 0) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) return null;
    end = Math.min(end, total - 1);
  }
  return { start, end, partial: true };
}

export function createHomeRailArtifactAdapter({
  client,
  taskService,
  cacheDirectory,
  maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
  now = () => new Date().toISOString(),
}) {
  if (typeof cacheDirectory !== "string" || !cacheDirectory.trim()) {
    throw new TypeError("HomeRail Artifact Adapter requires a private cacheDirectory.");
  }
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes < 1) {
    throw new TypeError("maxArtifactBytes must be a positive safe integer.");
  }

  function cacheFile(taskId, artifactId) {
    return join(cacheDirectory, `${cacheKey(taskId, artifactId)}.bin`);
  }

  async function verifiedCachedBytes(taskId, artifactId, expectedSize, expectedHash) {
    try {
      const path = cacheFile(taskId, artifactId);
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size !== expectedSize) return null;
      const bytes = await readFile(path);
      return sha256(bytes) === expectedHash ? bytes : null;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async function writeValidatedCache(taskId, artifactId, bytes) {
    await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
    const destination = cacheFile(taskId, artifactId);
    const temporary = join(cacheDirectory, `.${cacheKey(taskId, artifactId)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await chmod(temporary, 0o600).catch(() => {});
      await rename(temporary, destination).catch(async (error) => {
        if (!new Set(["EEXIST", "EPERM"]).has(error?.code)) throw error;
        await rm(destination, { force: true });
        await rename(temporary, destination);
      });
      await chmod(destination, 0o600).catch(() => {});
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function validateReadyArtifact(taskId, runId, record, previous) {
    const artifactId = assertIdentifier(record.artifact_id, "Artifact id");
    const name = assertIdentifier(record.name, "Artifact name");
    const { mediaType, expectedHash, expectedSize } = assertReadyMetadata(record, maxArtifactBytes);
    let bytes = await verifiedCachedBytes(taskId, artifactId, expectedSize, expectedHash);
    if (!bytes) {
      const response = await client.artifactContent(runId, name, {});
      if (!response?.ok || response.status !== 200) {
        throw artifactError("HOMERAIL_ARTIFACT_CONTENT_FAILED", `Artifact validation fetch returned HTTP ${response?.status ?? "unknown"}.`, 502);
      }
      const contentLength = response.headers.get("content-length");
      if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxArtifactBytes)) {
        throw artifactError("HOMERAIL_ARTIFACT_SIZE_INVALID", "Artifact Content-Length is invalid or exceeds the configured limit.");
      }
      const responseMediaType = normalizedMediaType(response.headers.get("content-type"));
      if (responseMediaType && responseMediaType !== mediaType) {
        throw artifactError("HOMERAIL_ARTIFACT_MEDIA_TYPE_MISMATCH", "Artifact response media type does not match its declaration.");
      }
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength !== expectedSize) {
        throw artifactError("HOMERAIL_ARTIFACT_SIZE_MISMATCH", "Artifact content size does not match its declaration.");
      }
      if (sha256(bytes) !== expectedHash) {
        throw artifactError("HOMERAIL_ARTIFACT_HASH_MISMATCH", "Artifact content SHA-256 does not match its declaration.");
      }
      await writeValidatedCache(taskId, artifactId, bytes);
    }
    return {
      artifactId,
      provider: "homerail",
      externalRunId: runId,
      externalName: name,
      name,
      mediaType,
      status: "ready",
      sha256: expectedHash,
      sizeBytes: expectedSize,
      cacheKey: cacheKey(taskId, artifactId),
      validatedAt: previous?.sha256 === expectedHash && previous?.sizeBytes === expectedSize && previous?.validatedAt
        ? previous.validatedAt
        : now(),
      contentPath: contentPath(taskId, artifactId),
      path: contentPath(taskId, artifactId),
      required: record.required === true,
    };
  }

  function nonReadyArtifact(taskId, runId, record, overrideError) {
    const artifactId = assertIdentifier(record.artifact_id, "Artifact id");
    const name = assertIdentifier(record.name, "Artifact name");
    const status = overrideError ? "failed" : normalizeStatus(record.status);
    if (!new Set(["pending", "failed", "skipped"]).has(status)) {
      throw artifactError("HOMERAIL_ARTIFACT_STATUS_INVALID", "Artifact status is invalid.");
    }
    return {
      artifactId,
      provider: "homerail",
      externalRunId: runId,
      externalName: name,
      name,
      mediaType: normalizedMediaType(record.media_type) || "application/octet-stream",
      status,
      ...(typeof record.sha256 === "string" && /^[a-f0-9]{64}$/i.test(record.sha256) ? { sha256: record.sha256.toLowerCase() } : {}),
      ...(Number.isSafeInteger(record.size_bytes) && record.size_bytes >= 0 ? { sizeBytes: record.size_bytes } : {}),
      contentPath: contentPath(taskId, artifactId),
      path: contentPath(taskId, artifactId),
      required: record.required === true,
      ...(overrideError || record.error?.code || record.error?.message ? {
        error: overrideError ?? { code: record.error?.code ?? "HOMERAIL_ARTIFACT_FAILED", message: record.error?.message ?? "Artifact failed." },
      } : {}),
    };
  }

  async function sync(taskId) {
    const task = await taskService.get(taskId);
    const attempt = task.attempts.at(-1);
    if (attempt?.provider !== "homerail" || !attempt.externalRunId) return { task, gate: "ready" };
    const result = await client.runArtifacts(attempt.externalRunId);
    const records = Array.isArray(result?.artifacts) ? result.artifacts : [];
    const normalizedRecords = [];
    let invalidRequired = false;
    for (const record of records) {
      try {
        const previous = task.artifacts.find((artifact) => artifact.artifactId === record?.artifact_id);
        normalizedRecords.push(record?.status === "ready"
          ? await validateReadyArtifact(taskId, attempt.externalRunId, record, previous)
          : nonReadyArtifact(taskId, attempt.externalRunId, record));
      } catch (error) {
        if (record?.required === true) invalidRequired = true;
        try {
          normalizedRecords.push(nonReadyArtifact(taskId, attempt.externalRunId, record, {
            code: error?.code ?? "HOMERAIL_ARTIFACT_INTEGRITY_FAILED",
            message: error instanceof Error ? error.message : "Artifact integrity validation failed.",
          }));
        } catch {
          // Invalid external identity cannot be persisted as a local artifact.
        }
      }
    }
    const ready = normalizedRecords.filter((artifact) => artifact.status === "ready");
    const primaryId = (ready.find((artifact) => artifact.required) ?? ready[0] ?? normalizedRecords[0])?.artifactId;
    let current = task;
    for (const record of normalizedRecords) {
      const normalized = { ...record, primary: record.artifactId === primaryId };
      const previous = current.artifacts.find((artifact) => artifact.artifactId === normalized.artifactId);
      if (JSON.stringify(previous) !== JSON.stringify(normalized)) current = await taskService.addArtifact(taskId, normalized);
    }
    const required = normalizedRecords.filter((artifact) => artifact.required === true);
    const gate = invalidRequired || required.some((artifact) => artifact.status === "failed" || artifact.status === "skipped")
      ? "failed"
      : required.some((artifact) => artifact.status !== "ready")
        ? "pending"
        : "ready";
    return { task: current, gate };
  }

  async function content(taskId, artifactId, { range } = {}) {
    let task = await taskService.get(taskId);
    let artifact = task.artifacts.find((candidate) => candidate.artifactId === artifactId);
    if (!artifact) {
      const error = artifactError("TASK_ARTIFACT_NOT_FOUND", "Task artifact not found.", 404);
      throw error;
    }
    if (artifact.provider !== "homerail" || !artifact.externalRunId || !artifact.externalName || artifact.status !== "ready" || !artifact.sha256 || !Number.isSafeInteger(artifact.sizeBytes)) {
      throw artifactError("TASK_ARTIFACT_NOT_READY", "Task artifact content is not ready for proxying.");
    }
    let bytes = await verifiedCachedBytes(taskId, artifactId, artifact.sizeBytes, artifact.sha256);
    if (!bytes) {
      await sync(taskId);
      task = await taskService.get(taskId);
      artifact = task.artifacts.find((candidate) => candidate.artifactId === artifactId);
      if (artifact?.status === "ready") bytes = await verifiedCachedBytes(taskId, artifactId, artifact.sizeBytes, artifact.sha256);
    }
    if (!bytes) throw artifactError("TASK_ARTIFACT_CACHE_INVALID", "The validated artifact copy is missing or corrupt.");
    const selected = parseRange(range, bytes.byteLength);
    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Content-Type": artifact.mediaType,
      ETag: `"${artifact.sha256}"`,
    };
    if (!selected) {
      return new Response(null, { status: 416, headers: { ...commonHeaders, "Content-Range": `bytes */${bytes.byteLength}` } });
    }
    const body = bytes.subarray(selected.start, selected.end + 1);
    return new Response(body, {
      status: selected.partial ? 206 : 200,
      headers: {
        ...commonHeaders,
        "Content-Length": String(body.byteLength),
        ...(selected.partial ? { "Content-Range": `bytes ${selected.start}-${selected.end}/${bytes.byteLength}` } : {}),
      },
    });
  }

  return { sync, content };
}
