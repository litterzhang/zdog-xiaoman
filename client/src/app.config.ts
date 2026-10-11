import { brand } from './config/brand'
import { appPages } from './config/navigation'

export default defineAppConfig({
  pages: appPages,
  window: {
    navigationBarTitleText: brand.name, navigationBarBackgroundColor: '#f8f8f8',
    navigationBarTextStyle: 'black', backgroundColor: '#f8f8f8',
  },
  tabBar: {
    color: '#888888', selectedColor: '#667b91', backgroundColor: '#ffffff', borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '今日', iconPath: 'assets/tabs/home.png', selectedIconPath: 'assets/tabs/home-selected.png' },
      { pagePath: 'pages/items/index', text: '用品', iconPath: 'assets/tabs/items.png', selectedIconPath: 'assets/tabs/items-selected.png' },
      { pagePath: 'pages/me/index', text: '我们', iconPath: 'assets/tabs/me.png', selectedIconPath: 'assets/tabs/me-selected.png' },
    ],
  },
})
