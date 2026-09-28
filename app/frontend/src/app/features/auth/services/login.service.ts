import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private readonly institutionalDomains = [
    '@estudiantec.cr',
    '@tec.ac.cr'
  ];

  isInstitutionalEmail(
    email: string
  ): boolean {
    const normalizedEmail =
      this.normalizeEmail(email);

    return this.institutionalDomains
      .some(
        (domain) =>
          normalizedEmail
            .endsWith(domain)
      );
  }

  normalizeEmail(
    email: string
  ): string {
    return email
      .trim()
      .toLowerCase();
  }
}