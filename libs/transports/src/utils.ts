export function replacePlaceholders(templateJson: any, data: any): any {
  const UNRESOLVED = Symbol('unresolved');

  // Helper function to recursively replace placeholders
  function recursiveReplace(obj: any, data: any): any {
    if (typeof obj === 'string') {
      // If the entire string is a single placeholder, resolve and return as-is
      // (including undefined/null) so the parent object can decide to omit the key.
      const singleMatch = /^\{%(.*?)%\}$/.exec(obj);
      if (singleMatch) {
        const keys = singleMatch[1].split('.');
        let value = data;
        keys.forEach((k: any) => {
          value = value ? value[k] : undefined;
        });
        return value === undefined || value === null || value === ''
          ? UNRESOLVED
          : value;
      }

      // Mixed string with placeholders — replace inline, missing values become ''
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
        const result = recursiveReplace(obj[key], data);
        // Omit keys whose placeholder resolved to nothing
        if (result !== UNRESOLVED) {
          newObj[key] = result;
        }
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
