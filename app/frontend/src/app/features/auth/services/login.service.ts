import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private readonly institutionalDomains = [
    '@estudiantec.cr',
    '@itcr.ac.cr',
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
    const address = email.trim();
    const at = address.lastIndexOf('@');
    // ms-users conserva la parte local como parte de la identidad institucional.
    return at < 0 ? address : address.slice(0, at + 1) + address.slice(at + 1).toLowerCase();
  }
}
