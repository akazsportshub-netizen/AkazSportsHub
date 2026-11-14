/** BullMQ queue names. */
export const QUEUE_HOLDS = 'booking-holds';
export const QUEUE_PAYMENTS = 'payments';
export const QUEUE_RINGERS = 'ringers';

/** Job names. */
export const JOB_EXPIRE_HOLD = 'expire-hold';
export const JOB_SWEEP = 'sweep';
export const JOB_CAPTURE = 'capture';
export const JOB_RELEASE = 'release';
export const JOB_RECRUIT_RINGERS = 'recruit';

export interface BookingJobData {
  bookingId: string;
}

export interface RingerJobData {
  requestId: string;
  wave: number;
}

/** How often the safety-net sweep runs. It catches anything a lost job would have handled. */
export const SWEEP_EVERY_MS = 60_000;
