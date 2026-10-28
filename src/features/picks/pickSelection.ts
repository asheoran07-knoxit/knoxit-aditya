// Primary/backup selection on the Pick screen. The backup can never be the
// same team as the primary (the server enforces this too).

export const BACKUP_CLEARED_NOTICE = "Backup cleared — pick a different team";

export function choosePrimary(nextPrimary: string, currentBackup: string | null) {
  if (currentBackup === nextPrimary) {
    return { primary: nextPrimary, backup: null, notice: BACKUP_CLEARED_NOTICE };
  }
  return { primary: nextPrimary, backup: currentBackup, notice: null };
}

export function isBackupSelectable(team: string, primary: string | null) {
  return team !== primary;
}
