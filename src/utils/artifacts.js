const path = require('node:path');

const MAX_ARTIFACT_FILES = 20;
const MAX_ARTIFACT_FILE_BYTES = 1024 * 1024;
const MAX_ARTIFACT_TOTAL_BYTES = 8 * 1024 * 1024;
const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
    '.7z', '.avi', '.bin', '.dll', '.doc', '.docx', '.exe', '.gif', '.gz',
    '.ico', '.jar', '.jpeg', '.jpg', '.mov', '.mp3', '.mp4', '.ogg', '.pdf',
    '.png', '.ppt', '.pptx', '.rar', '.tar', '.wav', '.webm', '.webp', '.xls',
    '.xlsx', '.zip',
]);

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    return value >>> 0;
}));

function crc32(buffer) {
    let checksum = 0xFFFFFFFF;
    for (const byte of buffer) {
        checksum = CRC_TABLE[(checksum ^ byte) & 0xFF] ^ (checksum >>> 8);
    }
    return (checksum ^ 0xFFFFFFFF) >>> 0;
}

function sanitizePathPart(value, fallback) {
    const safe = String(value || '')
        .replace(/[<>:"|?*\x00-\x1F]/g, '-')
        .replace(/[. ]+$/g, '')
        .trim()
        .slice(0, 80);
    return safe || fallback;
}

function sanitizeArtifactPath(value, index = 0) {
    const parts = String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter((part) => part && part !== '.' && part !== '..')
        .map((part, partIndex) => sanitizePathPart(part, `part-${partIndex + 1}`));
    if (!parts.length) return `file-${index + 1}.txt`;
    return parts.join('/').slice(0, 220);
}

function sanitizeArchiveName(value) {
    const requested = path.basename(String(value || '').replace(/\\/g, '/'));
    const safe = sanitizePathPart(requested, 'project.zip');
    return safe.toLowerCase().endsWith('.zip') ? safe : `${safe}.zip`;
}

function getExtension(filename) {
    return path.extname(filename).toLowerCase();
}

function normalizeArtifactFiles(rawFiles) {
    if (!Array.isArray(rawFiles) || !rawFiles.length) {
        throw new Error('At least one complete file is required.');
    }
    if (rawFiles.length > MAX_ARTIFACT_FILES) {
        throw new Error(`A single response can create up to ${MAX_ARTIFACT_FILES} files.`);
    }

    let totalBytes = 0;
    const seenPaths = new Set();
    return rawFiles.map((rawFile, index) => {
        const filename = sanitizeArtifactPath(rawFile?.path || rawFile?.name, index);
        const extension = getExtension(filename);
        if (UNSUPPORTED_BINARY_EXTENSIONS.has(extension)) {
            throw new Error(`${extension || 'That'} is a binary format and cannot be created from plain text output.`);
        }
        if (seenPaths.has(filename.toLowerCase())) {
            throw new Error(`The file path "${filename}" was provided more than once.`);
        }
        seenPaths.add(filename.toLowerCase());

        if (typeof rawFile?.content !== 'string') {
            throw new Error(`The file "${filename}" is missing its complete text content.`);
        }
        const data = Buffer.from(rawFile.content, 'utf8');
        if (data.length > MAX_ARTIFACT_FILE_BYTES) {
            throw new Error(`The file "${filename}" is larger than 1MB.`);
        }
        totalBytes += data.length;
        if (totalBytes > MAX_ARTIFACT_TOTAL_BYTES) {
            throw new Error('The generated files are larger than the 8MB delivery limit.');
        }

        return { path: filename, data };
    });
}

function createZipBuffer(files) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
        const filename = Buffer.from(file.path, 'utf8');
        const checksum = crc32(file.data);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034B50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0x0021, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(file.data.length, 18);
        localHeader.writeUInt32LE(file.data.length, 22);
        localHeader.writeUInt16LE(filename.length, 26);
        localHeader.writeUInt16LE(0, 28);
        localParts.push(localHeader, filename, file.data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014B50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0x0021, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(file.data.length, 20);
        centralHeader.writeUInt32LE(file.data.length, 24);
        centralHeader.writeUInt16LE(filename.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);
        centralParts.push(centralHeader, filename);

        localOffset += localHeader.length + filename.length + file.data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054B50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(localOffset, 16);
    endRecord.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function createArtifactAttachments(options = {}) {
    const normalizedFiles = normalizeArtifactFiles(options.files);
    const delivery = String(options.delivery || '').toLowerCase();
    const shouldBundle = delivery === 'zip'
        || normalizedFiles.length > 1
        || String(options.archiveName || '').toLowerCase().endsWith('.zip');

    if (shouldBundle) {
        const name = sanitizeArchiveName(options.archiveName);
        return {
            attachments: [{ attachment: createZipBuffer(normalizedFiles), name }],
            bundled: true,
            deliveredName: name,
            sourcePaths: normalizedFiles.map((file) => file.path),
        };
    }

    const file = normalizedFiles[0];
    const name = sanitizePathPart(path.basename(file.path), 'response.txt');
    return {
        attachments: [{ attachment: file.data, name }],
        bundled: false,
        deliveredName: name,
        sourcePaths: [file.path],
    };
}

module.exports = {
    MAX_ARTIFACT_FILES,
    createArtifactAttachments,
    createZipBuffer,
    crc32,
    normalizeArtifactFiles,
    sanitizeArtifactPath,
};
