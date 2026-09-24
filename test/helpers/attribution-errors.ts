/** A rejection in the attribution backend's `errors[]` envelope. */
export const errorBody = (errorCode: string, statusCode: number, message: string, fieldName: null | string = null) => ({
    errors: [{ error_code: errorCode, field_name: fieldName, message, status_code: statusCode }],
});
