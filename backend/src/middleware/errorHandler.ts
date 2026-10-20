import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isBodyParserError(error, 'entity.parse.failed')) {
    response.status(400).json({ status: 'error', message: 'Invalid JSON request body' });
    return;
  }
  if (isBodyParserError(error, 'entity.too.large')) {
    response.status(413).json({ status: 'error', message: 'Request body too large' });
    return;
  }

  console.error('Unhandled request error.');
  response.status(500).json({ status: 'error', message: 'Internal server error' });
};

function isBodyParserError(error: unknown, type: string): error is { type: string } {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === type;
}
