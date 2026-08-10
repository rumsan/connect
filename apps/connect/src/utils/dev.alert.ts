import axios from 'axios';

export const dev_SessionCompletionAlert = async (sessionCuid) => {
  try {
    console.log('===== Session Complete =====');
    if (!process.env.SLACK_URL || !process.env.SLACK_EMAIL) {
      console.log(
        'Notification Skipped! SLACK_URL or SLACK_EMAIL is not defined in environment variables',
      );
      return;
    }

    await axios.post(
      process.env.SLACK_URL as string,
      JSON.stringify({
        message: `Session with cuid ${sessionCuid} has been completed`,
        email: process.env.SLACK_EMAIL,
      }),
    );
  } catch (err) {
    console.log(err);
  }
};

export const dev_SessionAttemptComplete = async (sessionCuid) => {
  try {
    console.log('===== Session Attempt Complete =====');
    if (!process.env.SLACK_URL || !process.env.SLACK_EMAIL) {
      console.log(
        'Notification Skipped! SLACK_URL or SLACK_EMAIL is not defined in environment variables',
      );
      return;
    }
    await axios.post(
      process.env.SLACK_URL as string,
      JSON.stringify({
        message: `Session attempt complete: ${sessionCuid}`,
        email: process.env.SLACK_EMAIL,
      }),
    );
  } catch (err) {
    console.log(err);
  }
};

export const dev_NewBatchAlert = async (
  batchSize: number,
  sessionCuid: string,
) => {
  try {
    console.log(`===== Batch Started ${batchSize} =====`);
    if (!process.env.SLACK_URL || !process.env.SLACK_EMAIL) {
      console.log(
        'Notification Skipped! SLACK_URL or SLACK_EMAIL is not defined in environment variables',
      );
      return;
    }
    await axios.post(
      process.env.SLACK_URL as string,
      JSON.stringify({
        message: `Batch sent ${batchSize} - SessionId: ${sessionCuid}`,
        email: process.env.SLACK_EMAIL,
      }),
    );
  } catch (err) {
    console.log(err);
  }
};
