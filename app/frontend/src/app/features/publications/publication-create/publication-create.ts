import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, concatMap, EMPTY, from, map, of, switchMap, toArray } from 'rxjs';
import { AuthSessionService, SessionIdentity } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
import { CreatePublication, UpdatePublication } from '../models/publication-create.model';
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
  file: File;
  id: string;
  name: string;
  previewUrl: string;
}

interface EditTarget {
  id: string;
  identity: SessionIdentity;
  imagenes: string[];
  cover?: string;
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

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly flags = inject(FEATURE_FLAGS);
  readonly editing = this.route.snapshot.data['edit'] === true;
  private readonly session = this.editing && this.flags.authCoreV2 &&
    this.flags.authCoreV2Adapter === 'http' && this.flags.catalogInternalJwt
      ? inject(AuthSessionService) : null;
  private readonly target = signal<EditTarget | null>(null);
  readonly editCover = computed(() => this.target()?.cover);
  readonly loadingEdit = signal(this.editing);
  readonly editLoadError = signal('');
  readonly limits = this.editing
    ? { title: 200, subcategory: 100, location: 200, description: 5000, price: 0 }
    : { title: 100, subcategory: 50, location: 100, description: 600, price: 1 };

  readonly form = this.formBuilder.group({
    categoria: this.formBuilder.control<string>(
      'electronicos',
      {
        validators: [
          Validators.required,
          ...(this.editing ? [Validators.pattern(/\S/), Validators.maxLength(100)] : [])
        ]
      }
    ),

    subcategoria: this.formBuilder.control(
      '',
      {
        validators: [
          ...(this.editing ? [] : [Validators.required]),
          Validators.maxLength(this.limits.subcategory)
        ]
      }
    ),

    titulo: this.formBuilder.control(
      '',
      {
        validators: [
          Validators.required,
          this.editing ? Validators.pattern(/\S/) : Validators.minLength(5),
          Validators.maxLength(this.limits.title)
        ]
      }
    ),

    precio: this.formBuilder.control(
      0,
      {
        validators: [
          Validators.required,
          Validators.min(this.limits.price)
        ]
      }
    ),

    ubicacion: this.formBuilder.control(
      '',
      {
        validators: [
          ...(this.editing ? [] : [Validators.required]),
          Validators.maxLength(this.limits.location)
        ]
      }
    ),

    condicion:
      this.formBuilder.control<string | null>(
        'como-nuevo',
        {
          validators: this.editing ? [] : [Validators.required]
        }
      ),

    descripcion: this.formBuilder.control(
      '',
      {
        validators: [
          ...(this.editing ? [] : [Validators.required, Validators.minLength(10)]),
          Validators.maxLength(this.limits.description)
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
  readonly imageUploads = inject(FEATURE_FLAGS).catalogInternalJwt === true;

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

  constructor() {
    if (!this.editing) return;

    const session = this.session;
    this.route.paramMap.pipe(
      switchMap(params => {
        this.target.set(null);
        this.submitting.set(false);
        this.success.set(false);
        this.error.set(false);
        this.editLoadError.set('');
        this.loadingEdit.set(true);

        const id = params.get('id');
        const identity = session?.currentIdentity();
        if (!id || !identity) {
          this.failEditLoad('La edición requiere una sesión activa en el catálogo.');
          return EMPTY;
        }
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
          this.failEditLoad('El identificador de la publicación no es válido.');
          return EMPTY;
        }

        return this.publicationService.getPublicationById(id).pipe(
          map(detail => ({ id, detail, identity })),
          catchError(() => {
            this.failEditLoad('No fue posible cargar la publicación para editarla.');
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ id, detail, identity }) => {
      if (!session?.isCurrentIdentity(identity) || detail.vendedor?.userId !== identity.userId || detail.id !== id) {
        this.failEditLoad('Solo el propietario puede editar esta publicación.');
        return;
      }
      const { categoria, subcategoria, titulo, descripcion, precio, condicion, ubicacion } = detail;
      this.form.reset({ categoria, subcategoria, titulo, descripcion, precio, condicion, ubicacion });
      this.target.set({
        id, identity, imagenes: detail.imagenes ?? [], cover: detail.imagenes?.[0] ?? detail.imagen,
      });
      this.loadingEdit.set(false);
    });
  }

  private failEditLoad(message: string): void {
    this.editLoadError.set(message);
    this.loadingEdit.set(false);
  }

  selectCategory(
    category: PublicationCategory
  ): void {
    if (this.editing && this.form.controls.categoria.value === category) return;
    this.form.controls.categoria.setValue(
      category
    );

    this.form.controls.categoria.markAsDirty();
    this.form.controls.subcategoria.setValue(
      ''
    );
  }

  selectCondition(
    condition: PublicationCondition | null
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
            ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
            file.size > 0 && file.size <= 10 * 1024 * 1024
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

    if (this.editing) {
      this.saveChanges(value);
      return;
    }

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

    const cover = this.coverImage();
    const images = this.images();
    const ordered = cover ? [cover, ...images.filter(image => image.id !== cover.id)] : images;
    const save = this.imageUploads && ordered.length
      ? from(ordered).pipe(
          concatMap(image => this.publicationService.uploadImage(image.file)),
          toArray(),
          switchMap(imagenes => this.publicationService.createPublication({ ...publication, imagenes })),
        )
      : of(publication).pipe(switchMap(value => this.publicationService.createPublication(value)));

    save.pipe(takeUntilDestroyed(this.destroyRef))
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

  private saveChanges(value: CreatePublication): void {
    const target = this.target();
    if (!target || !this.session?.isCurrentIdentity(target.identity)) {
      this.error.set(true);
      this.errorMessage.set('La sesión cambió. Vuelve a Mis publicaciones para continuar.');
      return;
    }

    const changes: UpdatePublication = { ...value, imagenes: target.imagenes };
    this.submitting.set(true);
    this.publicationService.updatePublication(target.id, changes).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        if (this.target() !== target) return;
        this.submitting.set(false);
        if (!this.session?.isCurrentIdentity(target.identity)) return;
        this.publicationFeedback.notifyUpdated();
        void this.router.navigate(['/mis-publicaciones']);
      },
      error: (error: unknown) => {
        if (this.target() !== target) return;
        this.submitting.set(false);
        this.error.set(true);
        this.errorMessage.set(error instanceof HttpErrorResponse && error.status === 403
          ? 'Solo el propietario puede editar esta publicación.'
          : 'No fue posible guardar los cambios. Inténtalo nuevamente.');
      },
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
        file,
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
    value: string | null
  ): string {
    if (value === null) return 'Sin condición';
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
