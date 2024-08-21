import axios from 'axios';

export const dev_SessionCompletionAlert = async (sessionCuid) => {
  try {
    console.log('===== Session Complete =====');
    await axios.post(process.env.PRABHU_SMS_URL as string, [
      {
        Message: `Session with cuid ${sessionCuid} has been completed`,
        MobileNumber: process.env.DEV_PHONE,
      },
    ]);
  } catch (err) {
    console.log(err);
  }
};

export const dev_SessionAttemptComplete = async (sessionCuid) => {
  try {
    console.log('===== Session Attempt Complete =====');
    await axios.post(process.env.PRABHU_SMS_URL as string, [
      {
        Message: `Session attempt complete: ${sessionCuid}`,
        MobileNumber: process.env.DEV_PHONE,
      },
    ]);
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
