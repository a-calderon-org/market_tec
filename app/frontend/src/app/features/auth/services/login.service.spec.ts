import { TestBed } from '@angular/core/testing';
import { LoginService } from './login.service';

describe('LoginService', () => {
  let service:
    LoginService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LoginService
      ]
    });

    service =
      TestBed.inject(
        LoginService
      );
  });

  it('should create the service', () => {
    expect(
      service
    ).toBeTruthy();
  });

  it('should accept estudiantec.cr emails', () => {
    expect(
      service.isInstitutionalEmail(
        'usuario@estudiantec.cr'
      )
    ).toBe(true);
  });

  it('should accept tec.ac.cr emails', () => {
    expect(
      service.isInstitutionalEmail(
        'usuario@tec.ac.cr'
      )
    ).toBe(true);
  });

  it('should reject non institutional emails', () => {
    expect(
      service.isInstitutionalEmail(
        'usuario@gmail.com'
      )
    ).toBe(false);
  });

  it('should normalize email before validation', () => {
    expect(
      service.isInstitutionalEmail(
        '  USUARIO@ESTUDIANTEC.CR  '
      )
    ).toBe(true);
  });

  it('should normalize an email', () => {
    expect(
      service.normalizeEmail(
        '  USUARIO@ESTUDIANTEC.CR  '
      )
    ).toBe(
      'usuario@estudiantec.cr'
    );
  });
});