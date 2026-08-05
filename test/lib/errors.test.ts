import {expect} from 'chai'

import {parseApiError} from '../../src/lib/errors.js'

describe('parseApiError', () => {
  it('keeps the Developer API shape working', () => {
    const error = parseApiError(400, {error_code: 'validation_error', errors: {title: ['is required']}})
    expect(error.errorCode).to.equal('validation_error')
    expect(error.fieldErrors.title).to.deep.equal(['is required'])
    expect(error.detail).to.equal(undefined)
  })

  it('leaves the Developer API untouched by the ASA branches', () => {
    const listed = parseApiError(404, {errors: [{error_code: 'cli_entity_not_found', message: 'No campaign.'}]})
    const stringDetail = parseApiError(400, {detail: 'idempotency_key is required'})
    const listDetail = parseApiError(422, {detail: [{loc: ['body', 'scope'], msg: 'Field required'}]})

    expect(listed.errorCode).to.equal('http_404')
    expect(listed.message).to.equal('http_404')
    expect(stringDetail.detail).to.equal(undefined)
    expect(stringDetail.message).to.equal('http_400')
    expect(listDetail.fieldErrors).to.deep.equal({})
  })

  it('reads code and human message out of the ASA error list', () => {
    const error = parseApiError(
      404,
      {
        errors: [
          {
            error_code: 'cli_entity_not_found',
            field_name: null,
            message: 'No campaign with id abc exists for this company.',
            status_code: 404,
          },
        ],
      },
      {},
      'asa',
    )
    expect(error.errorCode).to.equal('cli_entity_not_found')
    expect(error.detail).to.equal('No campaign with id abc exists for this company.')
    expect(error.message).to.equal('No campaign with id abc exists for this company.')
    expect(error.toJSON().error_code).to.equal('cli_entity_not_found')
  })

  it('collects several listed errors and their field names', () => {
    const error = parseApiError(
      422,
      {
        errors: [
          {error_code: 'first', field_name: 'bid_amount', message: 'too low'},
          {error_code: 'second', field_name: 'text', message: 'too long'},
        ],
      },
      {},
      'asa',
    )
    expect(error.errorCode).to.equal('first')
    expect(error.detail).to.equal('too low; too long')
    expect(error.fieldErrors).to.deep.equal({bid_amount: ['too low'], text: ['too long']})
  })

  it('reads the Apple rejection shape that mutations answer with', () => {
    const error = parseApiError(
      400,
      {
        ad_group: null,
        errors: [
          {
            apple_error_code: 'REQUIRED_VALUE',
            apple_error_message: 'Field [pricingModel] is missing.',
            entity_type: 'AD_GROUP',
            operation: 'CREATE',
          },
        ],
      },
      {},
      'asa',
    )
    expect(error.errorCode).to.equal('REQUIRED_VALUE')
    expect(error.message).to.equal('Field [pricingModel] is missing.')
  })

  it('reads our own validation shape and points at the offending item', () => {
    const error = parseApiError(
      400,
      {
        errors: [
          {
            input_ref: 0,
            validation_error_code: 'DUPLICATE_KEYWORD',
            validation_error_message: 'Keyword text already exists in this ad group.',
          },
        ],
        is_validation_failure: true,
        keywords: [],
      },
      {},
      'asa',
    )
    expect(error.errorCode).to.equal('DUPLICATE_KEYWORD')
    expect(error.message).to.equal('Keyword text already exists in this ad group. (item 1)')
  })

  it('falls back to the code when a rejection carries no message', () => {
    const error = parseApiError(400, {errors: [{apple_error_code: 'INVALID_BID'}]}, {}, 'asa')
    expect(error.errorCode).to.equal('INVALID_BID')
    expect(error.message).to.equal('INVALID_BID')
  })

  it('carries Retry-After into the error and its JSON form', () => {
    const error = parseApiError(
      429,
      {errors: [{error_code: 'cli_rate_limit_exceeded', message: 'Slow down.'}]},
      {retryAfterSeconds: 7},
      'asa',
    )
    expect(error.retryAfterSeconds).to.equal(7)
    expect(error.message).to.equal('Slow down.')
    expect(error.toJSON().retry_after_seconds).to.equal(7)
  })

  it('unpacks a FastAPI validation detail into field errors', () => {
    const error = parseApiError(
      422,
      {
        detail: [
          {loc: ['body', 'keywords', 0, 'text'], msg: 'Field required'},
          {loc: ['body', 'scope'], msg: 'Input should be AD_GROUP'},
        ],
      },
      {},
      'asa',
    )
    expect(error.fieldErrors['keywords.0.text']).to.deep.equal(['Field required'])
    expect(error.fieldErrors.scope).to.deep.equal(['Input should be AD_GROUP'])
  })

  it('falls back to the status code when the body says nothing useful', () => {
    expect(parseApiError(500, 'oops').errorCode).to.equal('http_500')
    expect(parseApiError(503, {}).errorCode).to.equal('http_503')
    expect(parseApiError(400, {detail: 'idempotency_key is required'}, {}, 'asa').detail).to.equal(
      'idempotency_key is required',
    )
  })
})
