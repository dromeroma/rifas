import { CommonModule } from '@angular/common';
import { Component, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <label class="field" [class.field--err]="!!error()">
      @if (label()) { <span class="field__label">{{ label() }}</span> }
      <div class="field__box">
        @if (icon()) { <span class="material-icons field__icon">{{ icon() }}</span> }
        <input
          [type]="type()"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [attr.autocomplete]="autocomplete()"
          [attr.inputmode]="inputmode()"
          [value]="value"
          (input)="onInput($event)"
          (blur)="onTouched()"
        />
        @if (suffix()) { <span class="field__suffix">{{ suffix() }}</span> }
      </div>
      @if (error()) { <small class="field__err">{{ error() }}</small> }
      @else if (hint()) { <small class="field__hint">{{ hint() }}</small> }
    </label>
  `,
  styles: [`
    :host { display: block; }
    .field { display: grid; gap: 6px; }
    .field__label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .field__box {
      display: flex;
      align-items: center;
      gap: var(--s-2);
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      transition: border-color var(--t-fast), background var(--t-fast);
    }
    .field__box:focus-within {
      border-color: var(--accent);
      background: var(--bg-elevated);
    }
    .field__icon { color: var(--text-faint); font-size: 18px; }
    .field__suffix { color: var(--text-muted); font-size: 13px; }
    input {
      flex: 1;
      width: 100%;
      background: transparent;
      border: 0;
      outline: 0;
      color: var(--text);
      font-size: 15px;
      min-width: 0;
    }
    input::placeholder { color: var(--text-faint); }
    input:disabled { opacity: 0.6; cursor: not-allowed; }

    .field--err .field__box {
      border-color: var(--danger);
      background: var(--danger-soft);
    }
    .field__err { color: var(--danger); font-size: 12px; }
    .field__hint { color: var(--text-faint); font-size: 12px; }
  `],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputComponent), multi: true }],
})
export class InputComponent implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly type = input<string>('text');
  readonly placeholder = input<string>('');
  readonly icon = input<string | null>(null);
  readonly suffix = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  readonly autocomplete = input<string>('off');
  readonly inputmode = input<string>('text');

  value: string | number = '';
  onChange: (v: any) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(v: any): void { this.value = v ?? ''; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState?(_: boolean): void { /* handled via input */ }

  onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.value = v;
    this.onChange(v);
  }
}
