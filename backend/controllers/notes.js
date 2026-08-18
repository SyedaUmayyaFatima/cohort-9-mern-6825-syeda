const fs = require("fs");
const Note = require("../models/Note");
const logger = require("../config/logger");
const { parseImportFile } = require("../utils/noteFileParser");
const { buildExportFile, SUPPORTED_FORMATS } = require("../utils/noteFileExporter");

const MAX_IMPORT_NOTES = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 20000;

const getNotes = async (req, res) => {
  try {
    const notes = await Note.find({ owner: req.user.id, trashed: false }).sort({
      updatedAt: -1,
    });
    res.status(200).json(notes);
  } catch (error) {
    logger.error({ err: error }, "GetNotes error");
    res.status(500).json({ message: "Server error fetching notes" });
  }
};

const getTrashedNotes = async (req, res) => {
  try {
    const notes = await Note.find({ owner: req.user.id, trashed: true }).sort({
      trashedAt: -1,
    });
    res.status(200).json(notes);
  } catch (error) {
    logger.error({ err: error }, "GetTrashedNotes error");
    res.status(500).json({ message: "Server error fetching trash" });
  }
};

const getNoteById = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    res.status(200).json(note);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    logger.error({ err: error }, "GetNoteById error");
    res.status(500).json({ message: "Server error fetching note" });
  }
};

const createNote = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Please provide a title" });
    }

    const note = await Note.create({
      title,
      content: content || "",
      owner: req.user.id,
    });

    logger.info({ noteId: note._id, userId: req.user.id }, "Note created");

    res.status(201).json(note);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    logger.error({ err: error }, "CreateNote error");
    res.status(500).json({ message: "Server error creating note" });
  }
};

const updateNote = async (req, res) => {
  try {
    const { title, content } = req.body;

    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;

    await note.save();

    logger.info({ noteId: note._id, userId: req.user.id }, "Note updated");

    res.status(200).json(note);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }
    logger.error({ err: error }, "UpdateNote error");
    res.status(500).json({ message: "Server error updating note" });
  }
};

const togglePin = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    note.pinned = !note.pinned;
    await note.save();

    res.status(200).json(note);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    logger.error({ err: error }, "TogglePin error");
    res.status(500).json({ message: "Server error updating pin" });
  }
};

const trashNote = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    note.trashed = true;
    note.trashedAt = new Date();
    note.pinned = false;
    await note.save();

    logger.info({ noteId: note._id, userId: req.user.id }, "Note moved to trash");

    res.status(200).json(note);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    logger.error({ err: error }, "TrashNote error");
    res.status(500).json({ message: "Server error moving note to trash" });
  }
};

const restoreNote = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    note.trashed = false;
    note.trashedAt = null;
    await note.save();

    logger.info({ noteId: note._id, userId: req.user.id }, "Note restored");

    res.status(200).json(note);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    logger.error({ err: error }, "RestoreNote error");
    res.status(500).json({ message: "Server error restoring note" });
  }
};

const permanentlyDeleteNote = async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.id,
      trashed: true,
    });

    if (!note) {
      return res.status(404).json({ message: "Note not found in trash" });
    }

    logger.info({ noteId: note._id, userId: req.user.id }, "Note permanently deleted");

    res.status(200).json({ message: "Note permanently deleted" });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid note id" });
    }
    logger.error({ err: error }, "PermanentlyDeleteNote error");
    res.status(500).json({ message: "Server error deleting note" });
  }
};

const exportNotes = async (req, res) => {
  const format = (req.query.format || "csv").toLowerCase();

  if (!SUPPORTED_FORMATS.includes(format)) {
    return res.status(400).json({
      message: `Unsupported format. Choose one of: ${SUPPORTED_FORMATS.join(", ")}`,
    });
  }

  let filePath;

  try {
    const notes = await Note.find({ owner: req.user.id, trashed: false })
      .sort({ createdAt: 1 })
      .lean();

    if (notes.length === 0) {
      return res.status(404).json({ message: "You have no notes to export" });
    }

    const built = buildExportFile(notes, format);
    filePath = built.filePath;

    logger.info(
      { userId: req.user.id, noteCount: notes.length, format },
      "Notes exported"
    );

    res.download(filePath, built.filename, (err) => {
      // Clean up the temp file from disk regardless of whether the
      // download succeeded or the client disconnected mid-stream.
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          logger.error({ err: unlinkErr }, "Failed to clean up export temp file");
        }
      });

      if (err) {
        logger.error({ err }, "Error sending export file");
      }
    });
  } catch (error) {
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
    logger.error({ err: error }, "ExportNotes error");
    res.status(500).json({ message: "Server error exporting notes" });
  }
};

const importNotes = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload a .csv, .txt, or .xlsx file" });
  }

  const uploadedPath = req.file.path;

  try {
    let rawNotes;
    try {
      rawNotes = parseImportFile(uploadedPath);
    } catch (parseError) {
      logger.warn({ err: parseError }, "ImportNotes parse error");
      return res.status(400).json({ message: "Could not parse the uploaded file" });
    }

    if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
      return res.status(400).json({ message: "No notes found in the uploaded file" });
    }

    if (rawNotes.length > MAX_IMPORT_NOTES) {
      return res.status(400).json({
        message: `Cannot import more than ${MAX_IMPORT_NOTES} notes at once`,
      });
    }

    const validNotes = [];
    const skipped = [];

    rawNotes.forEach((raw, index) => {
      const title = typeof raw?.title === "string" ? raw.title.trim() : "";
      const content = typeof raw?.content === "string" ? raw.content.trim() : "";

      if (!title) {
        skipped.push({ index, reason: "Missing or empty title" });
        return;
      }

      if (title.length > MAX_TITLE_LENGTH) {
        skipped.push({ index, reason: "Title too long" });
        return;
      }

      if (content.length > MAX_CONTENT_LENGTH) {
        skipped.push({ index, reason: "Content too long" });
        return;
      }

      validNotes.push({
        title,
        content,
        owner: req.user.id,
        pinned: false,
      });
    });

    if (validNotes.length === 0) {
      return res.status(400).json({
        message: "No valid notes to import",
        skipped,
      });
    }

    const created = await Note.insertMany(validNotes, { ordered: false });

    logger.info(
      { userId: req.user.id, imported: created.length, skipped: skipped.length },
      "Notes imported"
    );

    res.status(201).json({
      message: `Imported ${created.length} note(s)`,
      imported: created.length,
      skippedCount: skipped.length,
      skipped,
      notes: created,
    });
  } catch (error) {
    logger.error({ err: error }, "ImportNotes error");
    res.status(500).json({ message: "Server error importing notes" });
  } finally {
    fs.unlink(uploadedPath, (unlinkErr) => {
      if (unlinkErr) {
        logger.error({ err: unlinkErr }, "Failed to clean up uploaded temp file");
      }
    });
  }
};

module.exports = {
  getNotes,
  getTrashedNotes,
  getNoteById,
  createNote,
  updateNote,
  togglePin,
  trashNote,
  restoreNote,
  permanentlyDeleteNote,
  exportNotes,
  importNotes,
};