import { ValidationAddress, ValidationContent } from '@prisma/client';

export const getAddressValidator = (validationType: ValidationAddress) => {
  const validators = {
    [ValidationAddress.ANY]: (address?: string) => true,
    [ValidationAddress.EMAIL]: (address: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address),
    [ValidationAddress.PHONE]: (address: string) =>
      /^\+?[0-9]\d{1,15}$/.test(address),
  };
  return validators[validationType];
};

export const getContentValidator = (validationType: ValidationContent) => {
  const validators = {
    [ValidationContent.URL]: (content: string) =>
      /^https?:\/\/[^\s$.?#].[^\s]*$/.test(content),
    [ValidationContent.TEXT]: (content: string) => typeof content === 'string',
  };
  return validators[validationType];
};
