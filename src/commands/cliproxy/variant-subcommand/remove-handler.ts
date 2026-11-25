/**
 * CLIProxy Variant Remove Handler
 */

import { initUI, header, color, ok, fail, warn, info } from '../../../utils/ui';
import { InteractivePrompt } from '../../../utils/prompt';
import { listVariants, removeVariant } from '../../../cliproxy/services';
import { parseProfileArgs } from './shared-helpers';

export async function handleRemove(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  if (parsedArgs.errors.length > 0) {
    parsedArgs.errors.forEach((errorMessage) => console.log(fail(errorMessage)));
    process.exitCode = 1;
    return;
  }
  const variants = listVariants();
  const variantNames = Object.keys(variants);

  if (variantNames.length === 0) {
    console.log(warn('No CLIProxy variants to remove'));
    process.exit(0);
  }

  let name = parsedArgs.name;
  if (!name) {
    console.log(header('Remove CLIProxy Variant'));
    console.log('');
    console.log('Available variants:');
    variantNames.forEach((n, i) => {
      const v = variants[n];
      const label = v.type === 'composite' ? 'composite' : v.provider;
      console.log(`  ${i + 1}. ${n} (${label})`);
    });
    console.log('');
    name = await InteractivePrompt.input('Variant name to remove', {
      validate: (val) => {
        if (!val) return 'Variant name is required';
        if (!variantNames.includes(val)) return `Variant '${val}' not found`;
        return null;
      },
    });
  }

  if (!variantNames.includes(name)) {
    console.log(fail(`Variant '${name}' not found`));
    console.log('');
    console.log('Available variants:');
    variantNames.forEach((n) => console.log(`  - ${n}`));
    process.exit(1);
  }

  const variant = variants[name];
  console.log('');
  console.log(`Variant '${color(name, 'command')}' will be removed.`);
  if (variant.type === 'composite') {
    console.log(`  Type:     composite`);
    if (variant.tiers) {
      console.log(`  Opus:     ${variant.tiers.opus.provider} / ${variant.tiers.opus.model}`);
      console.log(`  Sonnet:   ${variant.tiers.sonnet.provider} / ${variant.tiers.sonnet.model}`);
      console.log(`  Haiku:    ${variant.tiers.haiku.provider} / ${variant.tiers.haiku.model}`);
    }
  } else {
    console.log(`  Provider: ${variant.provider}`);
  }
  if (variant.port) {
    console.log(`  Port:     ${variant.port}`);
  }
  console.log(`  Target:   ${variant.target || 'claude'}`);
  console.log(`  Settings: ${variant.settings || '-'}`);
  console.log('');

  const confirmed =
    parsedArgs.yes || (await InteractivePrompt.confirm('Delete this variant?', { default: false }));
  if (!confirmed) {
    console.log(info('Cancelled'));
    process.exit(0);
  }

  const result = removeVariant(name);
  if (!result.success) {
    console.log(fail(`Failed to remove variant: ${result.error}`));
    process.exit(1);
  }

  console.log(ok(`Variant removed: ${name}`));
  console.log('');
}
