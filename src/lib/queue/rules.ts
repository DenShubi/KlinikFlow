// Queue rules shown to people. They mirror the database settings (keep in step):
//   private.rejoin_offset()  -> REJOIN_OFFSET
//   private.max_defers()     -> MAX_DEFERS
//   private.absent_after()   -> ABSENT_AFTER_MINUTES

// A late or absent patient goes back behind this many patients who are present.
export const REJOIN_OFFSET = 2;

// A called patient who does not come in is moved back at most this many times;
// the next absence removes the ticket ("Tidak hadir").
export const MAX_DEFERS = 2;

// A called patient who has not come in after this many minutes is moved back automatically.
export const ABSENT_AFTER_MINUTES = 5;
