import { Component, input } from '@angular/core';
import { Publication } from '../features/publications/models/publication.model';

@Component({
  selector: 'app-publication-card',
  standalone: true,
  imports: [],
  templateUrl: './publication-card.html',
  styleUrl: './publication-card.scss'
})
export class PublicationCard {
  readonly publication = input.required<Publication>();

  formatCondition(condition: string | null): string {
    if (!condition) {
      return '';
    }

    return condition
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CR').format(price);
  }

  formatRelativeDate(date: string): string {
    const publicationDate = new Date(date);
    const now = new Date();

    const differenceMs = now.getTime() - publicationDate.getTime();
    const hours = Math.floor(differenceMs / 3_600_000);

    if (hours < 1) {
      return 'Hace menos de 1h';
    }

    if (hours < 24) {
      return `Hace ${hours}h`;
    }

    const days = Math.floor(hours / 24);

    if (days === 1) {
      return 'Ayer';
    }

    return `Hace ${days}d`;
  }

  onImageError(event: Event): void {
    console.log('Fallback ejecutado')
    const image = event.target as HTMLImageElement;

    image.onerror = null;
    image.src = '/images/publication-placeholder.svg';
  }
}