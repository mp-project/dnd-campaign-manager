export {
  NOTES_MODULE_DEPENDENCIES,
  notesModule,
  type NotesModuleDependencies,
} from "#src/modules/notes/Setup";
export { notesPermissionDefinitions } from "#src/modules/notes/permissions/NotesPermissions";
export {
  noteContentFormatEnum,
  notes,
  noteTypeEnum,
} from "#src/modules/notes/domain/entities/NotesTable";
export type { NoteRow } from "#src/modules/notes/domain/repository/NotesRepository";
export { NotesService } from "#src/modules/notes/service/NotesService";
