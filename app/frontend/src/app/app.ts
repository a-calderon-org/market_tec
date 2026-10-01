import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme.service';
import { GoogleAuthService } from './features/auth/services/google-auth.service';
import { Profile } from './features/profile/profile';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Profile],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly googleAuth = inject(GoogleAuthService);
  private readonly router = inject(Router);

  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal(false);
  protected readonly profileImageFailed = signal(false);
  protected readonly profileOpen = signal(false);
  protected readonly userInitials = computed(() => {
    const user = this.googleAuth.user();
    const label = user?.name?.trim() || user?.email?.split('@')[0] || 'U';
    const words = label.split(/\s+/).filter(Boolean);

    return (words.length > 1
      ? `${words[0][0]}${words.at(-1)?.[0] ?? ''}`
      : words[0].slice(0, 2)
    ).toUpperCase();
  });

  protected useProfileInitials(): void {
    this.profileImageFailed.set(true);
  }

  protected openProfile(): void {
    this.profileOpen.set(true);
  }

  protected closeProfile(): void {
    this.profileOpen.set(false);
  }

  protected async logout(): Promise<void> {
    if (this.loggingOut()) return;

    this.loggingOut.set(true);
    this.logoutError.set(false);

    try {
      this.closeProfile();
      await this.googleAuth.logout();
      await this.router.navigate(['/login']);
    } catch {
      this.logoutError.set(true);
    } finally {
      this.loggingOut.set(false);
    }
  }
}
