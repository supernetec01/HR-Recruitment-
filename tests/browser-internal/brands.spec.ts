import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';

const password=process.env.SUPERNET_E2E_PASSWORD!;
let admin:APIRequestContext;
async function login(page:Page,username='admin') {
  await page.goto('/');await page.getByLabel('Tài khoản hoặc email').fill(username);await page.getByLabel(/^Mật khẩu(?: \*)?$/).fill(password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page.locator('.sidebar-user')).toBeVisible();
}
test.beforeAll(async({playwright})=>{
  admin=await playwright.request.newContext({baseURL:'http://127.0.0.1:3110',extraHTTPHeaders:{'X-Requested-With':'SuperNet'}});
  expect((await admin.post('/api/v1/login',{data:{login:'admin',password}})).ok()).toBeTruthy();
  const users=await(await admin.get('/api/v1/users')).json();
  if (!users.some((user:{username:string})=>user.username==='hr.brands')) expect((await admin.post('/api/v1/admin/users',{data:{username:'hr.brands',name:'HR thương hiệu',role:'hr',password}})).status()).toBe(201);
});
test.afterAll(async()=>{await admin?.dispose();});

test('Admin manages brand logo and channels; candidates can open stores and see published changes',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page);await page.locator('.main-nav').getByRole('button',{name:'Thương hiệu & cửa hàng',exact:true}).click();
  await expect(page.locator('.brand-admin-card')).toHaveCount(3);
  await page.getByRole('button',{name:'Thêm thương hiệu',exact:true}).click();const form=page.getByRole('dialog');
  const name='Brand kiểm thử giao diện';
  await form.getByLabel(/^Tên thương hiệu/).fill(name);await form.getByLabel('Ngành hàng',{exact:true}).fill('Sản phẩm kiểm thử');
  await form.getByLabel('Mô tả thương hiệu',{exact:true}).fill('Giới thiệu các sản phẩm và kênh bán hàng của thương hiệu kiểm thử.');
  await form.getByLabel(/^Liên kết kênh 1/).fill('https://example.com/store');
  const logo=await sharp({create:{width:240,height:80,channels:4,background:'#245c86'}}).png().toBuffer();
  await form.getByLabel('Logo thương hiệu',{exact:true}).setInputFiles({name:'brand-logo.png',mimeType:'image/png',buffer:logo});
  await form.getByRole('button',{name:'Thêm kênh',exact:true}).click();await form.getByLabel(/^Tên kênh 2/).fill('Website');await form.getByLabel(/^Liên kết kênh 2/).fill('https://example.com/website');
  await form.getByRole('button',{name:'Lưu thương hiệu',exact:true}).click();await expect(form).toHaveCount(0);
  const card=page.locator('.brand-admin-card').filter({has:page.getByRole('heading',{name,exact:true})});await expect(card).toBeVisible();
  await expect.poll(()=>card.getByRole('img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(240);
  await page.screenshot({path:test.info().outputPath('admin-brands-desktop.png'),fullPage:true,animations:'disabled'});
  const anonymous=await browser.newContext({baseURL:'http://127.0.0.1:3110'}),applicant=await anonymous.newPage();
  await applicant.goto('/tuyen-dung');const showcase=applicant.locator('.company-brand-card').filter({has:applicant.getByRole('heading',{name,exact:true})});
  await expect(showcase).toBeVisible();await expect(showcase).toContainText('Sản phẩm kiểm thử');await expect(showcase.getByRole('img')).toBeVisible();
  await expect.poll(()=>showcase.getByRole('img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(240);
  await applicant.context().route('https://example.com/**',route=>route.fulfill({body:'Store navigation test',contentType:'text/plain'}));
  const popup=applicant.waitForEvent('popup');await showcase.getByRole('link',{name:`Mở Shopee của ${name} (tab mới)`,exact:true}).click();const store=await popup;await expect(store).toHaveURL('https://example.com/store');await store.close();
  await card.getByRole('button',{name:`Chỉnh sửa ${name}`,exact:true}).click();await form.getByLabel('Mô tả thương hiệu',{exact:true}).fill('Mô tả đã được cập nhật.');
  await form.getByRole('button',{name:'Gỡ logo',exact:true}).click();await form.getByLabel('Hiển thị trên trang tuyển dụng').uncheck();await form.getByRole('button',{name:'Lưu thương hiệu',exact:true}).click();await expect(form).toHaveCount(0);
  await applicant.reload();await expect(showcase).toHaveCount(0);
  await card.getByRole('button',{name:`Chỉnh sửa ${name}`,exact:true}).click();await form.getByLabel('Hiển thị trên trang tuyển dụng').check();await form.getByRole('button',{name:'Lưu thương hiệu',exact:true}).click();await expect(form).toHaveCount(0);
  await applicant.reload();await expect(showcase).toContainText('Mô tả đã được cập nhật.');await expect(showcase.getByRole('img')).toHaveCount(0);
  await card.getByRole('button',{name:`Xóa ${name}`,exact:true}).click();await expect(form).toContainText('Các tin tuyển dụng');await form.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect(form).toHaveCount(0);await expect(card).toHaveCount(0);
  await applicant.reload();await expect(showcase).toHaveCount(0);await anonymous.close();expect(errors).toEqual([]);
});

test('new brands become JD options and retain their names after removal from the showcase',async({page})=>{
  const brandResponse=await admin.post('/api/v1/admin/brands',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{name:'Brand JD động',active:true,channels:[{label:'Website',url:'https://example.com/jd'}]}});expect(brandResponse.status()).toBe(201);const brand=await brandResponse.json();
  await login(page);await page.locator('.main-nav').getByRole('button',{name:'Vị trí tuyển dụng',exact:true}).click();await page.getByRole('button',{name:'Tạo JD tuyển dụng',exact:true}).click();const form=page.getByRole('dialog');
  await expect(form.getByLabel('Ngành hàng',{exact:true}).locator(`option[value="${brand.id}"]`)).toHaveText('Brand JD động');
  await form.getByLabel('Ngành hàng',{exact:true}).selectOption(brand.id);await form.getByLabel(/^Tên vị trí/).fill('JD kiểm thử thương hiệu động');await form.getByLabel(/^Bộ phận/).fill('Marketing');await form.getByLabel(/^Địa điểm làm việc/).fill('TP. Hồ Chí Minh');await form.getByLabel(/^Mô tả công việc/).fill('Cập nhật nội dung và thông tin sản phẩm cho thương hiệu.');
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/v1/jobs')&&response.request().method()==='POST');await form.getByRole('button',{name:'Lưu & đăng JD',exact:true}).click();const job=await(await saved).json();await expect(form).toHaveCount(0);
  expect((await admin.delete(`/api/v1/admin/brands/${brand.id}`,{data:{expectedRevision:brand.revision}})).ok()).toBeTruthy();
  await page.goto(`/tuyen-dung/${job.id}`);await expect(page.locator('.public-jd-heading')).toContainText('Brand JD động');
  const result=await admin.get(`/api/v1/public/jobs/${job.id}`);expect(result.ok()).toBeTruthy();expect((await result.json()).brand_name).toBe('Brand JD động');
});

test('HR cannot see brand management or access its page directly',async({page})=>{
  await login(page,'hr.brands');await expect(page.locator('.main-nav').getByRole('button',{name:'Thương hiệu & cửa hàng',exact:true})).toHaveCount(0);
  await page.goto('/?page=brands');await expect(page.getByRole('alert')).toContainText('Chỉ Admin');await expect(page.getByRole('button',{name:'Thêm thương hiệu',exact:true})).toHaveCount(0);
  const response=await page.request.get('/api/v1/admin/brands');expect(response.status()).toBe(403);
});

test('public showcase and Admin form fit desktop, tablet and mobile in both languages',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const language of ['vi','zh-CN']) {
    await page.goto('/tuyen-dung');await page.getByLabel('Ngôn ngữ / 语言').selectOption(language);await expect(page.locator('.company-brand-card')).toHaveCount(3);
    for(const width of [320,375,768,1440]) {
      await page.setViewportSize({width,height:960});await expect(page.locator('.company-showcase')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      for(const link of await page.locator('.company-brand-channels a').all()) {const box=await link.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);}
      await page.screenshot({path:test.info().outputPath(`public-brands-${language}-${width}.png`),fullPage:true,animations:'disabled'});
    }
  }
  await page.getByLabel('Ngôn ngữ / 语言').selectOption('vi');await page.setViewportSize({width:1440,height:1000});await login(page);await page.goto('/?page=brands');await page.getByRole('button',{name:'Thêm thương hiệu',exact:true}).click();const form=page.getByRole('dialog');
  for(const width of [320,375,768,1440]) {
    await page.setViewportSize({width,height:844});await expect(form).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    expect(await form.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBeTruthy();await expect(form.getByRole('button',{name:'Lưu thương hiệu',exact:true})).toBeInViewport();
    await page.screenshot({path:test.info().outputPath(`admin-brand-form-${width}.png`),fullPage:true,animations:'disabled'});
  }
  await form.getByRole('button',{name:'Hủy',exact:true}).click();expect(errors).toEqual([]);
});
