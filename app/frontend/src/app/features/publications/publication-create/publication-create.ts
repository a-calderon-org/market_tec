import { Component, computed, inject, signal} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CreatePublication } from '../models/publication-create.model';
import { PublicationService } from '../services/publication.service';
import { PublicationFeedbackService } from '../services/publication-feedback.service';

type PublicationCategory =
  | 'electronicos'
  | 'alquiler'
  | 'tutoria';

type PublicationCondition =
  | 'nuevo'
  | 'como-nuevo'
  | 'buen-estado'
  | 'para-repuesto';

interface LocalImage {
  id: string;
  name: string;
  previewUrl: string;
}

@Component({
  selector: 'app-publication-create',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './publication-create.html',
  styleUrl: './publication-create.scss'
})
export class PublicationCreate {
  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  private readonly publicationService =
    inject(PublicationService);

  private readonly publicationFeedback =
    inject(PublicationFeedbackService);

  private readonly router =
    inject(Router);

  readonly form = this.formBuilder.group({
    categoria: this.formBuilder.control<PublicationCategory>(
      'electronicos',
      {
        validators: [
          Validators.required
        ]
      }
    ),

    subcategoria: this.formBuilder.control(
      '',
      {
        validators: [
          Validators.required,
          Validators.maxLength(50)
        ]
      }
    ),

    titulo: this.formBuilder.control(
      '',
      {
        validators: [
          Validators.required,
          Validators.minLength(5),
          Validators.maxLength(100)
        ]
      }
    ),

    precio: this.formBuilder.control(
      0,
      {
        validators: [
          Validators.required,
          Validators.min(1)
        ]
      }
    ),

    ubicacion: this.formBuilder.control(
      '',
      {
        validators: [
          Validators.required,
          Validators.maxLength(100)
        ]
      }
    ),

    condicion:
      this.formBuilder.control<PublicationCondition>(
        'como-nuevo',
        {
          validators: [
            Validators.required
          ]
        }
      ),

    descripcion: this.formBuilder.control(
      '',
      {
        validators: [
          Validators.required,
          Validators.minLength(10),
          Validators.maxLength(600)
        ]
      }
    )
  });

  readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      map(
        () =>
          this.form.getRawValue()
      )
    ),
    {
      initialValue:
        this.form.getRawValue()
    }
  );

  readonly images =
    signal<LocalImage[]>([]);

  readonly coverImageId =
    signal<string | null>(null);

  readonly submitting =
    signal(false);

  readonly success =
    signal(false);

  readonly error =
    signal(false);

  readonly errorMessage =
    signal('');

  readonly maxImages = 5;

  readonly remainingImages =
    computed(
      () =>
        this.maxImages -
        this.images().length
    );

  readonly coverImage =
    computed(() => {
      const images =
        this.images();

      const coverId =
        this.coverImageId();

      if (!coverId) {
        return images[0] ?? null;
      }

      return (
        images.find(
          (image) =>
            image.id === coverId
        ) ??
        images[0] ??
        null
      );
    });

  selectCategory(
    category: PublicationCategory
  ): void {
    this.form.controls.categoria.setValue(
      category
    );

    this.form.controls.categoria.markAsDirty();
    this.form.controls.subcategoria.setValue(
      ''
    );
  }

  selectCondition(
    condition: PublicationCondition
  ): void {
    this.form.controls.condicion.setValue(
      condition
    );

    this.form.controls.condicion.markAsDirty();
  }

  onPriceInput(
    event: Event
  ): void {
    const input =
      event.target as HTMLInputElement;

    if (input.value === '') {
      this.form.controls.precio.setValue(
        0
      );

      return;
    }

    const value =
      Number(input.value);

    if (
      Number.isNaN(value) ||
      value < 0
    ) {
      input.value = '0';

      this.form.controls.precio.setValue(
        0
      );

      return;
    }

    this.form.controls.precio.setValue(
      value
    );
  }

  onImagesSelected(
    event: Event
  ): void {
    const input =
      event.target as HTMLInputElement;

    const files =
      Array.from(
        input.files ?? []
      );

    if (files.length === 0) {
      return;
    }

    const availableSlots =
      this.remainingImages();

    if (availableSlots <= 0) {
      input.value = '';
      return;
    }

    const selectedFiles =
      files
        .filter(
          (file) =>
            file.type.startsWith(
              'image/'
            )
        )
        .slice(
          0,
          availableSlots
        );

    for (
      const file of selectedFiles
    ) {
      this.createImagePreview(file);
    }
    input.value = '';
  }

  setCoverImage(
    imageId: string
  ): void {
    const imageExists =
      this.images().some(
        (image) =>
          image.id === imageId
      );

    if (!imageExists) {
      return;
    }

    this.coverImageId.set(
      imageId
    );
  }

  removeImage(
    imageId: string
  ): void {
    const updatedImages =
      this.images().filter(
        (image) =>
          image.id !== imageId
      );

    this.images.set(
      updatedImages
    );

    if (
      this.coverImageId() === imageId
    ) {
      this.coverImageId.set(
        updatedImages[0]?.id ??
        null
      );
    }
  }

  isCoverImage(
    imageId: string
  ): boolean {
    return (
      this.coverImage()?.id === imageId
    );
  }

  isControlInvalid(
    controlName:
      keyof typeof this.form.controls
  ): boolean {
    const control =
      this.form.controls[
        controlName
      ];

    return (
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }

  submit(): void {
    this.success.set(false);
    this.error.set(false);
    this.errorMessage.set('');

    if (
      this.form.invalid ||
      this.submitting()
    ) {
      this.form.markAllAsTouched();
      return;
    }

    const value =
      this.form.getRawValue();

    const publication:
      CreatePublication = {
        categoria:
          value.categoria,

        subcategoria:
          value.subcategoria.trim(),

        titulo:
          value.titulo.trim(),

        descripcion:
          value.descripcion.trim(),

        precio:
          value.precio,

        condicion:
          value.condicion,

        ubicacion:
          value.ubicacion.trim()
      };

    this.submitting.set(true);

    this.publicationService
      .createPublication(
        publication
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.success.set(true);
          this.publicationFeedback.notifyCreated();
          void this.router.navigate(
            [
              '/mis-publicaciones'
            ],
            {
              state: {
                publicationCreated:
                  true
              }
            }
          );
        },

        error: () => {
          this.submitting.set(false);
          this.error.set(true);

          this.errorMessage.set(
            'No fue posible crear la publicación. Inténtalo nuevamente.'
          );
        }
      });
  }

  private createImagePreview(
    file: File
  ): void {
    const reader =
      new FileReader();

    reader.onload = () => {
      const previewUrl =
        reader.result;

      if (
        typeof previewUrl !==
        'string'
      ) {
        return;
      }

      const image: LocalImage = {
        id:
          `${Date.now()}-${file.name}-${Math.random()}`,

        name:
          file.name,

        previewUrl
      };

      const updatedImages = [
        ...this.images(),
        image
      ];

      this.images.set(
        updatedImages
      );

      if (
        this.coverImageId() ===
        null
      ) {
        this.coverImageId.set(
          image.id
        );
      }
    };

    reader.readAsDataURL(
      file
    );
  }

  formatLabel(
    value: string
  ): string {
    const labels: Record<string, string> = {
      electronicos: 'Electrónicos',
      alquiler: 'Alquiler',
      tutoria: 'Tutoría',
      nuevo: 'Nuevo',
      'como-nuevo': 'Como nuevo',
      'buen-estado': 'Buen estado',
      'para-repuesto': 'Para repuesto'
    };

    if (labels[value]) {
      return labels[value];
    }

    return value
      .split('-')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(' ');
  }

  formatPrice(
    price: number
  ): string {
    return new Intl.NumberFormat(
      'es-CR'
    ).format(price);
  }
}
