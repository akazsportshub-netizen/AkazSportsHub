import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JOB_RECRUIT_RINGERS, RingerJobData } from '../queues/queue.constants';
import { RingersService } from '../ringers/ringers.service';

/**
 * Ringer recruitment worker: runs one invitation wave per job. Each wave schedules the
 * next one five minutes later until the places are filled, the booking starts, or the
 * last wave has run.
 */
@Injectable()
export class RingerRecruitmentWorker {
  private readonly logger = new Logger(RingerRecruitmentWorker.name);

  constructor(private readonly ringers: RingersService) {}

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_RECRUIT_RINGERS) {
      this.logger.warn(`Unknown job "${job.name}" on the ringers queue`);
      return;
    }
    const { requestId, wave } = job.data as RingerJobData;
    await this.ringers.runWave(requestId, wave);
  }
}
