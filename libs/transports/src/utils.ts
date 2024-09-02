export function replacePlaceholders(templateJson: any, data: any): any {
  // Helper function to recursively replace placeholders
  function recursiveReplace(obj: any, data: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/{%(.*?)%}/g, (_, key) => {
        const keys = key.split('.');
        let value = data;
        keys.forEach((k: any) => {
          value = value ? value[k] : '';
        });
        return value || '';
      });
    } else if (Array.isArray(obj)) {
      return obj.map((item) => recursiveReplace(item, data));
    } else if (typeof obj === 'object') {
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        newObj[key] = recursiveReplace(obj[key], data);
      }
      return newObj;
    }
    return obj;
  }

  return recursiveReplace(templateJson, data);
}

export function hasBulkData(body: any): boolean {
  for (const key in body) {
    if (key === 'bulkData' && Array.isArray(body[key])) {
      return true; // bulkData property found
    } else if (typeof body[key] === 'object') {
      if (hasBulkData(body[key])) {
        return true; // Recursively check nested objects
      }
    }
  }
  return false; // bulkData not found
}

// Function to recursively find and replace bulkData
export function replaceBulkData<T>(body: any, bulkData: T[]): any {
  for (const key in body) {
    if (key === 'bulkData' && Array.isArray(body[key])) {
      return bulkData; // Return the bulkData array directly
    } else if (typeof body[key] === 'object') {
      const result = replaceBulkData(body[key], bulkData);
      if (result) {
        body[key] = result;
        return body;
      }
    }
  }
  return body; // If bulkData is not found, return the original body
}

export function extractBulkDataTemplate(body: any): any {
  for (const key in body) {
    if (key === 'bulkData' && Array.isArray(body[key])) {
      return body[key][0]; // Return the first item of bulkData
    } else if (typeof body[key] === 'object') {
      const result = extractBulkDataTemplate(body[key]);
      if (result) {
        return result;
      }
    }
  }
  return false; // If bulkData is not found, return an empty object
}
