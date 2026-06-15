import { BadRequestException } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { presentationMulterOptions } from './presentation-upload.options';

describe('presentationMulterOptions', () => {
  const config = {
    fileLimits: {
      maxFileSizeMb: 25,
      allowedPresentationFormats: ['pdf', 'ppt', 'pptx'],
      latePenalty: 1,
    },
  } as unknown as AppConfigService;

  const options = presentationMulterOptions(config);

  /** Invoke the fileFilter and capture the (error, acceptFile) callback args. */
  const runFilter = (originalname: string) => {
    const cb = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    options.fileFilter!({} as never, { originalname } as never, cb as never);
    return cb;
  };

  it('sets the size limit from the configured megabytes (413 ceiling)', () => {
    expect(options.limits?.fileSize).toBe(25 * 1024 * 1024);
  });

  it('uses in-memory storage (buffer reaches the use case)', () => {
    expect(options.storage).toBeDefined();
  });

  it.each(['deck.pdf', 'talk.ppt', 'slides.pptx', 'DECK.PDF'])(
    'accepts an allowlisted extension: %s',
    (name) => {
      const cb = runFilter(name);
      expect(cb).toHaveBeenCalledWith(null, true);
    },
  );

  it.each(['virus.exe', 'notes.txt', 'archive.tar.gz', 'README'])(
    'rejects a non-allowlisted name with a BadRequestException (→ 400, not 500): %s',
    (name) => {
      const cb = runFilter(name);
      expect(cb).toHaveBeenCalledTimes(1);
      const [error, accept] = cb.mock.calls[0];
      expect(error).toBeInstanceOf(BadRequestException);
      expect(accept).toBe(false);
    },
  );
});
