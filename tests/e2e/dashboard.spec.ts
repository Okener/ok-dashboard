import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Keep UI fixtures independent of the workspace owner's connected accounts.
test.beforeEach(async()=>{await writeFile(join(process.env.E2E_DATA_DIR!,'ledger.json'),JSON.stringify({entries:[],connections:{},overrides:{},updatedAt:null}));});
test('overview calculations, navigation, filters, diagram and ledger details',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await expect(page.getByText('Sample data',{exact:true})).toBeVisible();
 await page.locator('.flow-disclosure > summary').click();
 await expect(page.getByRole('group',{name:/Sankey diagram/})).toBeVisible();
 await page.getByRole('button',{name:'Node view',exact:true}).click();await expect(page.getByRole('group',{name:/Interactive node/})).toBeVisible();
 await page.getByRole('button',{name:'Net retained',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('not your bank balance');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Date range',exact:true}).click();await page.getByRole('menuitemradio',{name:'Last 7 days',exact:true}).click();await expect(page.getByRole('button',{name:'Date range',exact:true})).toContainText('Last 7 days');
 await page.getByRole('button',{name:'View all transactions'}).click();await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 await page.getByLabel('Search transactions').fill('refund');await expect(page.locator('tbody tr').first()).toContainText('refund');
 await page.locator('tbody .row-detail').first().click();await expect(page.getByRole('dialog')).toContainText('Transaction details');await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByLabel('Search transactions').fill('no-result-xyz');await expect(page.getByRole('heading',{name:'No transactions to show'})).toBeVisible();
 expect(errors).toEqual([]);
});
test('integration setup, CSV preview validation, and report download',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Integrations',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Integrations',exact:true})).toBeVisible();
 await page.locator('.integration-card').filter({has:page.getByRole('heading',{name:'Cloudflare',exact:true})}).getByRole('button').click();
 await expect(page.getByRole('dialog')).toContainText('Billing history');
 await page.getByLabel('Upload billing CSV').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from('id,source,date,amount,currency,description,category,kind,basis,status,counterparty\ntest,cloudflare,2026-09-22,-25.00,USD,Test invoice,Cloudflare,debit,accrual,posted,Cloudflare')});
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByText('1 valid records')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Transactions',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export report'}).click();expect((await download).suggestedFilename()).toContain('ok-finance');
});
test('mobile layout fits viewport, navigation and focus trap work',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Transactions',exact:true}).click();await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'How totals are calculated'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Shift+Tab');expect(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);await page.keyboard.press('Escape');
});

test('theme defaults to system, follows OS changes, and persists explicit overrides',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await page.goto('/');
 await expect(page.getByRole('button',{name:'System',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Dark',exact:true}).click();await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.getByRole('button',{name:'Dark',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Light',exact:true}).click();
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'System',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.getByRole('button',{name:'Activity notifications'})).toHaveCount(0);
});

test('mobile theme and search are directly accessible; data mode stays explicit',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Dark',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByLabel('Search transactions').fill('refund');
 await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();
 await expect(page.locator('tbody tr').first()).toContainText('refund');
 await expect(page.getByRole('textbox')).toHaveCount(1);
 await page.getByRole('button',{name:'Clear search'}).click();
 await expect(page.getByLabel('Search transactions')).toHaveValue('');
 await page.getByRole('button',{name:'Use live data'}).click();
 await expect(page.getByText('Live data',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No transactions to show'})).toBeVisible();
 await page.getByRole('button',{name:'Use sample data'}).click();
 await expect(page.locator('tbody tr')).not.toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('URL state, source selection, paging, history, and chart interactions survive HTML swaps',async({page})=>{
 await page.goto('/');
 await page.locator('.chart-wrap [data-tooltip]').first().focus();await expect(page.locator('.chart-tooltip')).toContainText('Credits');
 await page.locator('.flow-disclosure > summary').click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.locator('[data-zoom-label]')).toHaveText('110%');
 await page.getByRole('button',{name:'Reset zoom',exact:true}).click();await expect(page.locator('[data-zoom-label]')).toHaveText('100%');
 await page.getByRole('button',{name:'Data source',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'All sources',exact:true}).click();
 await expect(page.getByRole('heading',{name:'No transactions to show'})).toBeVisible();
 await expect(page.getByRole('menu',{name:'Data source'})).toBeVisible();
 await page.getByRole('menuitemcheckbox',{name:'Stripe',exact:true}).click();await expect(page.getByRole('menuitemcheckbox',{name:'Stripe',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Transactions',exact:true}).click();
 await expect(page.locator('tbody tr').first()).toContainText('Stripe');
 await page.getByRole('button',{name:'Date range',exact:true}).click();await page.getByRole('menuitemradio',{name:'Last 90 days',exact:true}).click();
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.pagination')).toContainText('13–24');
 await page.reload();await expect(page.locator('.pagination')).toContainText('13–24');await expect(page.getByRole('button',{name:'Date range',exact:true})).toContainText('Last 90 days');
 await page.getByRole('button',{name:'Cloud billing',exact:true}).click();await expect(page.getByRole('heading',{name:'No transactions to show'})).toBeVisible();
 await page.goBack();await expect(page.locator('.pagination')).toContainText('13–24');
 await page.getByRole('button',{name:'Date range',exact:true}).click();await page.getByRole('menuitemradio',{name:'Custom dates',exact:true}).click();
 await expect(page.getByLabel('Start date')).toBeVisible();
 const end=await page.getByLabel('End date').inputValue();await page.getByLabel('Start date').fill(end);
 await expect(page.locator('#content')).toHaveAttribute('data-state',new RegExp(`"start":"${end}"`));
});

test('CSV errors, preview invalidation, confirmed imports, classification and export use the isolated ledger',async({page,request})=>{
 const date=new Date().toISOString().slice(0,10);
 const header='id,source,date,amount,currency,description,category,kind,basis,status,counterparty\n';
 const csv=header+`review,mercury,${date},25.00,USD,Test settlement,Revenue,credit,cash,review,Example`;
 await page.goto('/');await page.getByRole('button',{name:'Integrations',exact:true}).click();
 await page.locator('.integration-card').filter({has:page.getByRole('heading',{name:'Mercury',exact:true})}).getByRole('button').click();
 await page.getByLabel('Upload billing CSV').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('invalid')});
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Invalid columns');
 await page.getByLabel('Upload billing CSV').setInputFiles({name:'valid.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByText('1 valid records')).toBeVisible();
 expect((await (await request.get('/api/data')).json()).entries).toHaveLength(0);
 await page.getByLabel('Upload billing CSV').setInputFiles({name:'replacement.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('button',{name:'Confirm import',exact:true}).click();
 await expect(page.getByText('Live data',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Transactions',exact:true}).click();await page.getByRole('button',{name:'Test settlement',exact:true}).click();
 await page.getByRole('button',{name:'Mark internal transfer',exact:true}).click();await expect(page.locator('tbody tr')).toContainText('Internal transfer');
 await page.getByRole('button',{name:'Test settlement',exact:true}).click();await page.getByRole('button',{name:'Verify external payment',exact:true}).click();
 await expect(page.locator('tbody tr')).toContainText('Revenue');
 const data=await (await request.get('/api/data')).json();expect(data.entries[0].kind).toBe('credit');expect(data.entries[0].status).toBe('posted');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('htmx')))).toEqual([]);
 await page.getByRole('button',{name:'Sync',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No API sources configured');
});

test('keyboard shortcuts, menu navigation, SVG activation, and focus restoration work after swaps',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Integrations',exact:true}).click();
 await page.keyboard.press('Control+k');await expect(page.getByRole('heading',{name:'Transactions',exact:true})).toBeVisible();await expect(page.getByLabel('Search transactions')).toBeFocused();
 const range=page.getByRole('button',{name:'Date range',exact:true});await range.focus();await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('menuitemradio',{name:'Last 7 days',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(page.getByRole('menuitemradio',{name:'Custom dates',exact:true})).toBeFocused();
 await page.keyboard.press('Home');await page.keyboard.press('Enter');await expect(range).toContainText('Last 7 days');await expect(range).toBeFocused();
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.locator('.flow-disclosure summary').click();await page.getByRole('button',{name:'Node view',exact:true}).click();
 const node=page.getByRole('button',{name:'Net retained',exact:true});await node.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(node).toBeFocused();
});
