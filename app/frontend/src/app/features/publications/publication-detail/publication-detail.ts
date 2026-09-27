import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicationDetail as PublicationDetailModel } from '../models/publication-detail.model';
import { PublicationService } from '../services/publication.service';

@Component({
  selector: 'app-publication-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './publication-detail.html',
  styleUrl: './publication-detail.scss'
})
export class PublicationDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly publicationService = inject(PublicationService);

  readonly publication = signal<PublicationDetailModel | null>(null);
  readonly selectedImage = signal<string>('/images/publication-placeholder.svg');

  readonly loading = signal(true);
  readonly error = signal(false);

  ngOnInit(): void {
    const publicationId =
      this.route.snapshot.paramMap.get('id');

    if (!publicationId) {
      this.loading.set(false);
      this.error.set(true);
      return;
    }

    this.loadPublication(publicationId);
  }

  loadPublication(id: string): void {
    this.loading.set(true);
    this.error.set(false);
    this.publication.set(null);

    this.publicationService
      .getPublicationById(id)
      .subscribe({
        next: (publication) => {
          this.publication.set(publication);

          const images =
            this.getGalleryImages(publication);

          this.selectedImage.set(
            images[0] ??
            '/images/publication-placeholder.svg'
          );

          this.loading.set(false);
        },

        error: () => {
          this.publication.set(null);
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  getGalleryImages(publication: PublicationDetailModel): string[] {
    if (
      publication.imagenes &&
      publication.imagenes.length > 0
    ) {
      return publication.imagenes;
    }

    if (publication.imagen) {
      return [publication.imagen];
    }

    return [
      '/images/publication-placeholder.svg'
    ];
  }

  selectImage(image: string): void {
    this.selectedImage.set(image);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat(
      'es-CR'
    ).format(price);
  }

  formatCondition(
    condition: string | null
  ): string {
    if (!condition) {
      return 'No especificada';
    }

    return this.formatLabel(condition);
  }

  formatCategory(value: string): string {
    return this.formatLabel(value);
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat(
      'es-CR',
      {
        dateStyle: 'medium'
      }
    ).format(new Date(date));
  }

  formatRelativeDate(date: string): string {
    const publicationDate =
      new Date(date);

    const now =
      new Date();

    const differenceMs =
      now.getTime() -
      publicationDate.getTime();

    const hours =
      Math.floor(
        differenceMs / 3_600_000
      );

    if (hours < 1) {
      return 'Hace menos de 1 hora';
    }

    if (hours < 24) {
      return `Hace ${hours}h`;
    }

    const days =
      Math.floor(hours / 24);

    if (days === 1) {
      return 'Ayer';
    }

    return `Hace ${days} días`;
  }

  onImageError(event: Event): void {
    const image =
      event.target as HTMLImageElement;

    image.src =
      '/images/publication-placeholder.svg';
  }

  private formatLabel(
    value: string
  ): string {
    return value
      .split('-')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(' ');
  }
}