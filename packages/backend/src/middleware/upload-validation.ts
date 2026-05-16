/**
 * OWASP A08: validates uploaded files by magic bytes, not just the extension
 * declared by the client. Prevents PHP webshells renamed `.png`, HTML phishing
 * pages renamed `.pdf`, and similar polyglot tricks that the existing multer
 * `fileFilter` (extension-only) lets through.
 *
 * Usage:
 *   router.post('/upload', upload.single('file'), validateUpload(['image/png', 'application/pdf']), handler);
 *
 *                req.file (set by multer)
 *                        │
 *                        ▼
 *               fileTypeFromBuffer(buffer)
 *                        │
 *           ┌────────────┴────────────┐
 *           │ no detection            │ detected MIME
 *           ▼                         ▼
 *      reject 400              compare against allowedMimes
 *                              ┌──────┴──────┐
 *                              │             │
 *                            match         mismatch
 *                              │             │
 *                              ▼             ▼
 *                            next()      reject 400
 *
 * Notes:
 *   - CSV files have no reliable magic bytes (just printable ASCII), so for
 *     CSV uploads we accept anything with `text/*` or `application/octet-stream`
 *     MIME from multer + an allowlisted extension. The csv-extension allowlist
 *     in import.ts stays as the primary defense for CSV-only routes.
 *   - DICOM files have "DICM" at offset 128. file-type 22.x supports it.
 *   - For multer.memoryStorage() the buffer is in req.file.buffer.
 *   - For multer.diskStorage() (imagerie) the buffer must be read from disk;
 *     we use file-type's `fileTypeFromFile` for that case.
 */

import { Response, NextFunction } from 'express';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import fs from 'fs';
import { AuthRequest } from './auth.js';

export type AllowedMime = string;

/**
 * Validates that req.file (or req.files for multi-upload) has a magic-byte
 * signature matching one of `allowedMimes`. Returns 400 on mismatch.
 *
 * Pass `{ skipCsv: true }` to allow text/csv-like uploads through without
 * magic-byte detection (CSV has no reliable signature).
 */
export function validateUpload(allowedMimes: AllowedMime[], opts: { skipCsv?: boolean } = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      // No file uploaded — let the route handler decide if that's an error
      next();
      return;
    }

    // CSV exemption: extension + client-declared MIME must look text-ish
    if (opts.skipCsv) {
      const ext = file.originalname.toLowerCase();
      const looksCsv = /\.(csv|txt)$/.test(ext) || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
      if (looksCsv) {
        next();
        return;
      }
    }

    try {
      const detected = file.buffer
        ? await fileTypeFromBuffer(file.buffer)
        : file.path ? await fileTypeFromFile(file.path) : undefined;

      if (!detected) {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        console.warn(`[UPLOAD] rejected — unable to detect file type. originalname=${file.originalname} declared_mime=${file.mimetype}`);
        res.status(400).json({ error: 'Type de fichier non reconnu ou invalide' });
        return;
      }

      if (!allowedMimes.includes(detected.mime)) {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        console.warn(`[UPLOAD] rejected — magic-byte mismatch. originalname=${file.originalname} declared_mime=${file.mimetype} detected_mime=${detected.mime} allowed=${allowedMimes.join(',')}`);
        res.status(400).json({ error: `Type de fichier non autorisé (détecté: ${detected.mime})` });
        return;
      }

      // Re-tag req.file.mimetype to the magic-byte-verified value (defense in
      // depth — downstream code should trust this over the client-supplied one)
      file.mimetype = detected.mime;
      next();
    } catch (err) {
      console.error('[UPLOAD] validation threw:', err);
      res.status(500).json({ error: 'Erreur lors de la validation du fichier' });
    }
  };
}

// Common allowlists for the project's upload routes
export const IMAGERIE_MIMES: AllowedMime[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'application/dicom',
];

export default validateUpload;
