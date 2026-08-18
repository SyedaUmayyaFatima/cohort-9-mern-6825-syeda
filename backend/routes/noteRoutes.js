const express = require("express");
const multer = require("multer");
const {
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
} = require("../controllers/notes");
const { protect } = require("../middleware/Auth");
const upload = require("../middleware/upload");

const router = express.Router();

router.use(protect);

router.get("/trash", getTrashedNotes);
router.get("/export", exportNotes);

router.post(
  "/import",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError || err.message.includes("Only .csv")) {
          return res.status(400).json({ message: err.message });
        }
        return next(err);
      }
      next();
    });
  },
  importNotes
);

router.get("/", getNotes);
router.get("/:id", getNoteById);
router.post("/", createNote);
router.put("/:id", updateNote);
router.patch("/:id/pin", togglePin);
router.patch("/:id/restore", restoreNote);
router.delete("/:id/permanent", permanentlyDeleteNote);
router.delete("/:id", trashNote);

module.exports = router;